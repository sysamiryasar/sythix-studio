import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Bookmark, Copy, EyeOff, Flag, Globe2, ImagePlus, Loader2, Lock, MessageCircle, MoreHorizontal, Pencil, Repeat2, Trash2, Users, X, CornerDownRight } from "lucide-react";
import type { CommentView, Page, PostView } from "@shared/types";
import { LIMITS, REACTIONS, REACTION_LABEL, REPORT_REASONS, type ReactionKind } from "@shared/schemas";
import { platformCan } from "@shared/permissions";
import { api, errorMessage } from "../lib/api";
import { compact, fullDate, relativeTime } from "../lib/format";
import { useMe } from "../lib/session";
import { Avatar, Badge, Button, Dialog, EmptyState, ErrorState, Field, Select, Spinner, Textarea, cn, useToast } from "./ui";

// Cache helpers ----------------------------------------------------------------------

/** Replaces a post (and any repost wrapping it) in every cached list and detail view. */
export function patchPost(qc: QueryClient, updated: PostView) {
  const fix = (p: PostView): PostView => (p.id === updated.id ? updated : p.repostOf?.id === updated.id ? { ...p, repostOf: updated } : p);
  qc.setQueriesData({ queryKey: ["posts"] }, (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    const o = old as { pages?: Page<PostView>[]; id?: string };
    if (o.pages) return { ...o, pages: o.pages.map((pg) => ({ ...pg, items: pg.items.map(fix) })) };
    if (o.id) return fix(old as PostView);
    return old;
  });
}

function removePost(qc: QueryClient, id: string) {
  qc.setQueriesData({ queryKey: ["posts"] }, (old: unknown) => {
    const o = old as { pages?: Page<PostView>[] } | undefined;
    if (!o?.pages) return old;
    return { ...o, pages: o.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== id && p.repostOf?.id !== id) })) };
  });
}

// Rich text ----------------------------------------------------------------------------

const TOKEN_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(#[\p{L}\p{N}_]{2,50})|(@[A-Za-z0-9_]{3,20})/gu;

/** Renders user text with links, #tags and @mentions. Never uses innerHTML. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const [tok] = m;
    if (m[1]) {
      out.push(
        <a key={i} href={tok} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-cyan underline-offset-2 hover:underline">
          {tok.replace(/^https?:\/\//, "").slice(0, 60)}
        </a>,
      );
    } else if (m[2]) {
      out.push(
        <Link key={i} to={`/social/tag/${encodeURIComponent(tok.slice(1).toLowerCase())}`} className="text-accent hover:underline">
          {tok}
        </Link>,
      );
    } else {
      out.push(
        <Link key={i} to={`/u/${tok.slice(1)}`} className="text-accent hover:underline">
          {tok}
        </Link>,
      );
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-relaxed", className)}>{out}</p>;
}

// Media ----------------------------------------------------------------------------------

function MediaGrid({ media }: { media: PostView["media"] }) {
  if (!media.length) return null;
  return (
    <div className={cn("mt-3 grid gap-1.5 overflow-hidden rounded-xl", media.length > 1 && "grid-cols-2")}>
      {media.map((m) =>
        m.kind === "video" ? (
          <video key={m.id} src={m.url} controls preload="metadata" className="max-h-[480px] w-full rounded-xl bg-black" />
        ) : (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="block">
            <img
              src={m.url}
              alt=""
              loading="lazy"
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              className={cn("w-full rounded-xl border border-border bg-surface-2 object-cover", media.length > 1 ? "aspect-square" : "max-h-[520px]")}
            />
          </a>
        ),
      )}
    </div>
  );
}

const VIS_ICON = { public: <Globe2 className="h-3 w-3" />, followers: <Users className="h-3 w-3" />, private: <Lock className="h-3 w-3" />, community: <Users className="h-3 w-3" /> };
const VIS_LABEL = { public: "Public", followers: "Followers", private: "Only you", community: "Community" };

// Post card ---------------------------------------------------------------------------

export function PostCard({ post, detail }: { post: PostView; detail?: boolean }) {
  if (post.repostOf || post.unavailable) {
    return (
      <div>
        <div className="flex items-center gap-2 px-4 pt-3 text-xs text-faint">
          <Repeat2 className="h-3.5 w-3.5" />
          <Link to={`/u/${post.author.username}`} className="hover:underline">
            {post.author.displayName}
          </Link>{" "}
          reposted
        </div>
        {post.repostOf ? <PostBody post={post.repostOf} detail={detail} /> : <p className="px-4 pb-4 pt-2 text-sm text-faint">This post is no longer available.</p>}
      </div>
    );
  }
  return <PostBody post={post} detail={detail} />;
}

function PostBody({ post, detail }: { post: PostView; detail?: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = useMutation({
    mutationFn: (fn: () => Promise<PostView | unknown>) => fn(),
    onSuccess: (data) => {
      if (data && typeof data === "object" && "id" in data && "author" in data) patchPost(qc, data as PostView);
    },
    onError: (e) => toast.error("That didn't work", errorMessage(e)),
  });

  const react = (kind: ReactionKind | null) => {
    setPicker(false);
    // Optimistic update.
    const was = post.viewer.reaction;
    const delta = kind && !was ? 1 : !kind && was ? -1 : 0;
    patchPost(qc, { ...post, viewer: { ...post.viewer, reaction: kind }, counts: { ...post.counts, reactions: post.counts.reactions + delta } });
    act.mutate(() => (kind ? api<PostView>(`/posts/${post.id}/reaction`, { method: "PUT", body: { kind } }) : api<PostView>(`/posts/${post.id}/reaction`, { method: "DELETE" })));
  };

  const repost = () => act.mutate(() => api<PostView>(`/posts/${post.id}/repost`, { method: post.viewer.reposted ? "DELETE" : "POST", body: {} }).then((p) => (qc.invalidateQueries({ queryKey: ["posts", "feed"] }), p)));
  const bookmark = () => {
    patchPost(qc, { ...post, viewer: { ...post.viewer, bookmarked: !post.viewer.bookmarked } });
    act.mutate(() => api(`/posts/${post.id}/bookmark`, { method: post.viewer.bookmarked ? "DELETE" : "PUT", body: {} }));
  };
  const saveEdit = () =>
    act.mutate(() => api<PostView>(`/posts/${post.id}`, { method: "PATCH", body: { body: draft } }).then((p) => (setEditing(false), p)));
  const remove = () =>
    act.mutate(async () => {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      removePost(qc, post.id);
      toast.success("Post deleted");
      if (detail) navigate("/social");
    });
  const hide = () => act.mutate(() => api(`/mod/posts/${post.id}`, { body: { hidden: !post.hidden } }).then(() => toast.success(post.hidden ? "Post restored" : "Post hidden")));

  const canRepost = post.visibility === "public" && !post.viewer.isAuthor;
  const reacted = post.viewer.reaction;

  return (
    <article className="px-4 py-3.5" aria-label={`Post by ${post.author.displayName}`}>
      <div className="flex gap-3">
        <Link to={`/u/${post.author.username}`} className="shrink-0">
          <Avatar user={post.author} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <Link to={`/u/${post.author.username}`} className="truncate font-semibold hover:underline">
              {post.author.displayName}
            </Link>
            <span className="truncate text-faint">@{post.author.username}</span>
            <span className="text-faint" aria-hidden>
              ·
            </span>
            <Link to={`/social/post/${post.id}`} className="shrink-0 text-faint hover:underline" title={fullDate(post.createdAt)}>
              <time dateTime={new Date(post.createdAt).toISOString()}>{relativeTime(post.createdAt)}</time>
            </Link>
            {post.visibility !== "public" && (
              <span className="flex items-center gap-1 text-xs text-faint" title={VIS_LABEL[post.visibility]}>
                {VIS_ICON[post.visibility]}
                <span className="sr-only">{VIS_LABEL[post.visibility]}</span>
              </span>
            )}
            <div className="relative ml-auto">
              <button onClick={() => setMenu((m) => !m)} className="rounded-lg p-1 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Post options" aria-expanded={menu}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                  <div role="menu" className="sx-in absolute right-0 z-30 mt-1 w-48 rounded-xl border border-border-strong bg-surface-2 p-1 shadow-xl">
                    <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => (navigator.clipboard?.writeText(`${location.origin}/social/post/${post.id}`), toast.success("Link copied"), setMenu(false))}>
                      Copy link
                    </MenuItem>
                    {post.viewer.isAuthor && (
                      <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => (setEditing(true), setDraft(post.body), setMenu(false))}>
                        Edit
                      </MenuItem>
                    )}
                    {post.viewer.isAuthor && (
                      <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => (setConfirmDelete(true), setMenu(false))}>
                        Delete
                      </MenuItem>
                    )}
                    {!post.viewer.isAuthor && (
                      <MenuItem icon={<Flag className="h-4 w-4" />} onClick={() => (setReporting(true), setMenu(false))}>
                        Report
                      </MenuItem>
                    )}
                    {platformCan(me.role, "moderation.hide_content") && !post.viewer.isAuthor && (
                      <MenuItem icon={<EyeOff className="h-4 w-4" />} onClick={() => (hide(), setMenu(false))}>
                        {post.hidden ? "Restore (mod)" : "Hide (mod)"}
                      </MenuItem>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {post.hidden && (
            <Badge tone="warning" className="mt-1">
              Hidden by moderators — only you can see this
            </Badge>
          )}
          {editing ? (
            <div className="mt-2 space-y-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={LIMITS.postBody} aria-label="Edit post" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" loading={act.isPending} disabled={!draft.trim()} onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            post.body && <RichText text={post.body} className={cn("mt-1", detail && "text-[17px]")} />
          )}
          {post.editedAt && !editing && <p className="mt-1 text-[11px] text-faint">Edited {relativeTime(post.editedAt)}</p>}
          <MediaGrid media={post.media} />
          <div className="mt-2.5 flex items-center gap-1 text-sm text-faint">
            <div className="relative">
              <button
                onClick={() => react(reacted ? null : "like")}
                onContextMenu={(e) => (e.preventDefault(), setPicker(true))}
                className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-surface-2", reacted && "text-magenta")}
                aria-pressed={!!reacted}
                aria-label={reacted ? `Remove reaction (${REACTION_LABEL[reacted]})` : "React"}
              >
                <span aria-hidden className="text-base leading-none">
                  {reacted ? REACTION_LABEL[reacted] : "♡"}
                </span>
                {post.counts.reactions > 0 && <span className="tabular-nums">{compact(post.counts.reactions)}</span>}
              </button>
              {picker && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPicker(false)} />
                  <div className="sx-in absolute bottom-9 left-0 z-30 flex gap-1 rounded-full border border-border-strong bg-surface-2 p-1 shadow-xl" role="menu" aria-label="Reactions">
                    {REACTIONS.map((k) => (
                      <button key={k} role="menuitem" onClick={() => react(k)} className="rounded-full p-1.5 text-lg leading-none hover:bg-surface-3" aria-label={k}>
                        {REACTION_LABEL[k]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setPicker((p) => !p)} className="rounded-lg px-1.5 py-1 text-xs hover:bg-surface-2" aria-label="Choose a reaction" aria-expanded={picker}>
              ▾
            </button>
            <Link to={`/social/post/${post.id}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-surface-2" aria-label={`${post.counts.comments} comments`}>
              <MessageCircle className="h-4 w-4" />
              {post.counts.comments > 0 && <span className="tabular-nums">{compact(post.counts.comments)}</span>}
            </Link>
            <button
              onClick={repost}
              disabled={!canRepost && !post.viewer.reposted}
              className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-surface-2 disabled:opacity-40", post.viewer.reposted && "text-success")}
              aria-pressed={post.viewer.reposted}
              aria-label={post.viewer.reposted ? "Undo repost" : "Repost"}
              title={canRepost || post.viewer.reposted ? undefined : "Only other people's public posts can be reposted"}
            >
              <Repeat2 className="h-4 w-4" />
              {post.counts.reposts > 0 && <span className="tabular-nums">{compact(post.counts.reposts)}</span>}
            </button>
            <button onClick={bookmark} className={cn("ml-auto rounded-lg px-2 py-1 hover:bg-surface-2", post.viewer.bookmarked && "text-cyan")} aria-pressed={post.viewer.bookmarked} aria-label={post.viewer.bookmarked ? "Remove bookmark" : "Bookmark"}>
              <Bookmark className={cn("h-4 w-4", post.viewer.bookmarked && "fill-current")} />
            </button>
          </div>
        </div>
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={post.id} />
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete post?">
        <p className="text-sm text-muted">This permanently deletes the post, its media, comments and reactions.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={act.isPending} onClick={() => (remove(), setConfirmDelete(false))}>
            Delete
          </Button>
        </div>
      </Dialog>
    </article>
  );
}

function MenuItem({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-3", danger ? "text-danger" : "text-muted hover:text-fg")}>
      {icon} {children}
    </button>
  );
}

// Report dialog --------------------------------------------------------------------------

const REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  hate: "Hate speech",
  violence: "Violence or threats",
  sexual_content: "Sexual content",
  impersonation: "Impersonation",
  misinformation: "Misinformation",
  other: "Something else",
};

export function ReportDialog({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: "user" | "post" | "comment" | "message" | "community"; targetId: string }) {
  const toast = useToast();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("spam");
  const [details, setDetails] = useState("");
  const m = useMutation({
    mutationFn: () => api("/reports", { body: { targetType, targetId, reason, details } }),
    onSuccess: () => {
      toast.success("Report sent", "Thanks — moderators will review it.");
      onClose();
    },
    onError: (e) => toast.error("Couldn't send report", errorMessage(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title={`Report ${targetType}`}>
      <div className="space-y-4">
        <Field label="What's wrong?">
          {(id) => (
            <Select id={id} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Details (optional)" hint="Helps moderators act faster. Don't include personal information.">
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate()}>
            Send report
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// Composer --------------------------------------------------------------------------------

interface Attachment {
  id?: string;
  previewUrl: string;
  kind: "image" | "video";
  uploading: boolean;
  error?: string;
}

export function Composer({ onPosted, autoFocus, compact: small }: { onPosted?: (p: PostView) => void; autoFocus?: boolean; compact?: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private">("public");
  const [files, setFiles] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.previewUrl)), [files]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const room = LIMITS.mediaPerPost - files.length;
    for (const file of [...list].slice(0, room)) {
      const kind = file.type.startsWith("video/") ? "video" : "image";
      const max = kind === "video" ? LIMITS.videoBytes : LIMITS.imageBytes;
      if (file.size > max) {
        toast.error("File too large", `${file.name} is over ${max / 1024 / 1024} MB.`);
        continue;
      }
      const entry: Attachment = { previewUrl: URL.createObjectURL(file), kind, uploading: true };
      setFiles((f) => [...f, entry]);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await api<{ id: string }>("/media", { method: "POST", raw: form });
        setFiles((f) => f.map((x) => (x.previewUrl === entry.previewUrl ? { ...x, id: res.id, uploading: false } : x)));
      } catch (e) {
        setFiles((f) => f.map((x) => (x.previewUrl === entry.previewUrl ? { ...x, uploading: false, error: errorMessage(e) } : x)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const m = useMutation({
    mutationFn: () => api<PostView>("/posts", { body: { body, visibility, mediaIds: files.flatMap((f) => (f.id ? [f.id] : [])) } }),
    onSuccess: (p) => {
      setBody("");
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Posted");
      onPosted?.(p);
    },
    onError: (e) => toast.error("Couldn't post", errorMessage(e)),
  });

  const uploading = files.some((f) => f.uploading);
  const ready = (body.trim().length > 0 || files.some((f) => f.id)) && !uploading && !files.some((f) => f.error);
  const remaining = LIMITS.postBody - body.length;

  return (
    <div className="flex gap-3 p-4">
      <Avatar user={me} size={42} />
      <div className="min-w-0 flex-1">
        <Textarea
          ref={textRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) m.mutate();
          }}
          rows={small ? 2 : 3}
          maxLength={LIMITS.postBody}
          placeholder="What's happening in your world? Use #tags and @mentions."
          aria-label="Write a post"
          className="resize-none border-transparent bg-transparent px-0 text-[15px] hover:border-transparent focus:border-transparent"
        />
        {files.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {files.map((f) => (
              <div key={f.previewUrl} className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
                {f.kind === "video" ? <video src={f.previewUrl} className="aspect-square w-full object-cover" muted /> : <img src={f.previewUrl} alt="" className="aspect-square w-full object-cover" />}
                {f.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                {f.error && <div className="absolute inset-0 flex items-center justify-center bg-danger/70 p-1 text-center text-[10px] text-white">{f.error}</div>}
                <button onClick={() => setFiles((all) => all.filter((x) => x !== f))} className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white" aria-label="Remove attachment">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={files.length >= LIMITS.mediaPerPost} aria-label="Add images or video" title="Images up to 5 MB, video up to 25 MB">
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} aria-label="Who can see this" className="h-8 w-auto py-0 text-xs">
            <option value="public">🌐 Public</option>
            <option value="followers">👥 Followers</option>
            <option value="private">🔒 Only me</option>
          </Select>
          <span className={cn("ml-auto text-xs tabular-nums", remaining < 100 ? "text-warning" : "text-faint")} aria-live="polite">
            {remaining < 300 ? remaining : ""}
          </span>
          <Button variant="primary" size="sm" disabled={!ready} loading={m.isPending} onClick={() => m.mutate()}>
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

// Feed list ---------------------------------------------------------------------------------

export function PostList({ queryKey, path, empty }: { queryKey: unknown[]; path: string; empty: { title: string; description?: string; action?: ReactNode } }) {
  const q = useInfiniteQuery({
    queryKey: ["posts", ...queryKey],
    queryFn: ({ pageParam, signal }) => api<Page<PostView>>(`${path}${path.includes("?") ? "&" : "?"}${pageParam ? `cursor=${encodeURIComponent(pageParam)}` : ""}`, { signal }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [q]);

  if (q.isPending) return <Spinner label="Loading posts" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const posts = q.data.pages.flatMap((p) => p.items);
  if (!posts.length) return <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  return (
    <div>
      <ul className="divide-y divide-border">
        {posts.map((p) => (
          <li key={p.id} className="sx-in">
            <PostCard post={p} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} />
      {q.isFetchingNextPage && <Spinner label="Loading more" />}
      {!q.hasNextPage && posts.length > 5 && <p className="py-6 text-center text-xs text-faint">You're all caught up.</p>}
    </div>
  );
}

// Comments ---------------------------------------------------------------------------------

export function Comments({ postId }: { postId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["comments", postId], queryFn: () => api<CommentView[]>(`/posts/${postId}/comments`) });
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api<CommentView>(`/posts/${postId}/comments`, { body: { body, parentId: replyTo?.id } }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ["comments", postId] });
      void qc.invalidateQueries({ queryKey: ["posts", "post", postId] });
    },
    onError: (e) => toast.error("Couldn't comment", errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", postId] }),
    onError: (e) => toast.error("Couldn't delete", errorMessage(e)),
  });

  const all = q.data ?? [];
  const top = all.filter((c) => !c.parentId);
  const replies = (id: string) => all.filter((c) => c.parentId === id);

  const row = (c: CommentView, nested = false) => (
    <li key={c.id} id={c.id} className={cn("flex gap-2.5 py-2.5", nested && "pl-10")}>
      <Avatar user={c.author} size={nested ? 26 : 32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <Link to={`/u/${c.author.username}`} className="font-medium hover:underline">
            {c.author.displayName}
          </Link>
          <span className="text-xs text-faint">{relativeTime(c.createdAt)}</span>
        </div>
        {c.deleted ? <p className="text-sm italic text-faint">Comment removed.</p> : <RichText text={c.body} className="text-sm" />}
        {!c.deleted && (
          <div className="mt-1 flex gap-3 text-xs text-faint">
            <button onClick={() => setReplyTo(c)} className="hover:text-fg">
              Reply
            </button>
            {c.canDelete && (
              <button onClick={() => del.mutate(c.id)} className="hover:text-danger">
                Delete
              </button>
            )}
            <button onClick={() => setReporting(c.id)} className="hover:text-fg">
              Report
            </button>
          </div>
        )}
      </div>
    </li>
  );

  return (
    <section aria-label="Comments" className="px-4 pb-4">
      <div className="flex gap-2 border-y border-border py-3">
        <div className="min-w-0 flex-1">
          {replyTo && (
            <div className="mb-1 flex items-center gap-1 text-xs text-faint">
              <CornerDownRight className="h-3 w-3" /> Replying to {replyTo.author.displayName}
              <button onClick={() => setReplyTo(null)} className="ml-1 hover:text-fg" aria-label="Cancel reply">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={LIMITS.commentBody} placeholder="Add a comment…" aria-label="Write a comment" />
        </div>
        <Button variant="primary" size="sm" className="self-end" disabled={!body.trim()} loading={add.isPending} onClick={() => add.mutate()}>
          Reply
        </Button>
      </div>
      {q.isPending ? (
        <Spinner label="Loading comments" />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : top.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No comments yet. Start the conversation.</p>
      ) : (
        <ul className="divide-y divide-border">
          {top.map((c) => (
            <div key={c.id}>
              {row(c)}
              {replies(c.id).map((r) => row(r, true))}
            </div>
          ))}
        </ul>
      )}
      {reporting && <ReportDialog open onClose={() => setReporting(null)} targetType="comment" targetId={reporting} />}
    </section>
  );
}
