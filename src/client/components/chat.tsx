import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { CornerUpLeft, Flag, Loader2, MoreHorizontal, Pencil, Pin, Search, SmilePlus, Trash2, Wifi, WifiOff, X } from "lucide-react";
import type { MessageView, RealtimeEvent } from "@shared/types";
import { LIMITS } from "@shared/schemas";
import { api, errorMessage } from "../lib/api";
import { fullDate, relativeTime } from "../lib/format";
import { useRoom } from "../lib/realtime";
import { useMe } from "../lib/session";
import { Avatar, Button, Dialog, Input, Spinner, ErrorState, Textarea, cn, useToast } from "./ui";
import { ReportDialog, RichText } from "./social";

type Kind = "channels" | "conversations";
interface MessagePage {
  items: MessageView[];
  hasMore: boolean;
  canPost: boolean;
  canModerate: boolean;
}

const QUICK = ["👍", "🔥", "😂", "💜", "🎮", "👀"];

/**
 * Real-time chat for a channel or conversation. Messages are persisted by the
 * API (D1) and fanned out by the room's Durable Object; on reconnect the
 * history is refetched so nothing sent while offline is missed.
 */
export function Chat({ kind, id, title, readOnlyReason }: { kind: Kind; id: string; title: string; readOnlyReason?: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["chat", kind, id];
  const room = `${kind === "channels" ? "channel" : "conv"}:${id}`;
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [online, setOnline] = useState<{ id: string; username: string }[]>([]);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);

  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api<MessagePage>(`/${kind}/${id}/messages${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore && last.items[0] ? last.items[0].createdAt : undefined),
  });

  const upsert = (m: MessageView) =>
    qc.setQueryData<InfiniteData<MessagePage>>(key, (old) => {
      if (!old) return old;
      const exists = old.pages.some((p) => p.items.some((x) => x.id === m.id));
      if (exists) return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === m.id ? m : x)) })) };
      const [first, ...rest] = old.pages;
      return { ...old, pages: [{ ...first!, items: [...first!.items, m] }, ...rest] };
    });

  const { status, send } = useRoom(
    room,
    (e: RealtimeEvent) => {
      if (e.type === "message.created" || e.type === "message.updated") {
        upsert(e.message);
        if (e.type === "message.created") setTyping((t) => Object.fromEntries(Object.entries(t).filter(([uid]) => uid !== e.message.author.id)));
      } else if (e.type === "message.deleted") {
        qc.setQueryData<InfiniteData<MessagePage>>(key, (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === e.id ? { ...x, deleted: true, body: "" } : x)) })) });
      } else if (e.type === "typing" && e.user.id !== me.id) {
        setTyping((t) => ({ ...t, [e.user.id]: { name: e.user.username, until: Date.now() + 4000 } }));
      } else if (e.type === "presence") {
        setOnline(e.users);
      }
    },
    () => void q.refetch(),
  );

  // Expire typing indicators.
  useEffect(() => {
    const t = setInterval(() => setTyping((all) => Object.fromEntries(Object.entries(all).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => clearInterval(t);
  }, []);

  // Mark read when opened and when new messages arrive while visible.
  const count = q.data?.pages[0]?.items.length ?? 0;
  useEffect(() => {
    if (document.visibilityState === "visible") void api(`/${kind}/${id}/read`, { body: {} }).then(() => qc.invalidateQueries({ queryKey: ["unread"] })).catch(() => {});
  }, [kind, id, count, qc]);

  // Pages are fetched newest-first; render oldest-first.
  const messages = q.data ? [...q.data.pages].reverse().flatMap((p) => p.items) : [];
  const meta = q.data?.pages[0];

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const sendMsg = useMutation({
    mutationFn: () =>
      editing
        ? api<MessageView>(`/messages/${editing.id}`, { method: "PATCH", body: { body: draft } })
        : api<MessageView>(`/${kind}/${id}/messages`, { body: { body: draft, replyTo: replyTo?.id } }),
    onSuccess: (m) => {
      upsert(m);
      setDraft("");
      setReplyTo(null);
      setEditing(null);
      stick.current = true;
    },
    onError: (e) => toast.error("Message not sent", errorMessage(e)),
  });

  const lastTyping = useRef(0);
  const onType = (v: string) => {
    setDraft(v);
    if (Date.now() - lastTyping.current > 2500 && v) {
      lastTyping.current = Date.now();
      send({ type: "typing" });
    }
  };

  const typers = Object.values(typing).map((t) => t.name);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
        <span className={cn("flex items-center gap-1 text-xs", status === "open" ? "text-success" : "text-faint")} title={status === "open" ? "Live" : "Reconnecting…"}>
          {status === "open" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{status === "open" ? `${online.length} here` : "Reconnecting"}</span>
        </span>
        <Button size="icon" variant="ghost" onClick={() => setPinsOpen(true)} aria-label="Pinned messages">
          <Pin className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setSearchOpen(true)} aria-label="Search messages">
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 60 && q.hasNextPage && !q.isFetchingNextPage) {
            const prev = el.scrollHeight;
            void q.fetchNextPage().then(() => requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - prev)));
          }
        }}
        className="sx-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3"
        role="log"
        aria-live="polite"
        aria-label={`Messages in ${title}`}
      >
        {q.isPending ? (
          <Spinner label="Loading messages" />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <>
            {q.isFetchingNextPage && <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-faint" />}
            {!q.hasNextPage && (
              <div className="px-3 pb-4 pt-2">
                <p className="font-display text-lg font-semibold">Welcome to {title}</p>
                <p className="text-sm text-faint">This is the start of the conversation.</p>
              </div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const grouped = !!prev && prev.author.id === m.author.id && m.createdAt - prev.createdAt < 5 * 60_000 && !m.replyTo;
              return <MessageRow key={m.id} m={m} grouped={grouped} canModerate={!!meta?.canModerate} isChannel={kind === "channels"} onReply={() => setReplyTo(m)} onEdit={() => (setEditing(m), setDraft(m.body))} upsert={upsert} />;
            })}
          </>
        )}
      </div>
      <div className="h-5 px-4 text-xs text-faint" aria-live="polite">
        {typers.length > 0 && `${typers.slice(0, 3).join(", ")} ${typers.length === 1 ? "is" : "are"} typing…`}
      </div>
      {meta && !meta.canPost ? (
        <p className="border-t border-border px-4 py-3 text-sm text-faint">{readOnlyReason ?? "You can read this channel but not post in it."}</p>
      ) : (
        <form
          className="border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) sendMsg.mutate();
          }}
        >
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-muted">
              {editing ? <Pencil className="h-3 w-3" /> : <CornerUpLeft className="h-3 w-3" />}
              <span className="min-w-0 flex-1 truncate">{editing ? "Editing message" : `Replying to ${replyTo!.author.displayName}: ${replyTo!.body}`}</span>
              <button type="button" onClick={() => (setReplyTo(null), setEditing(null), setDraft(""))} aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) sendMsg.mutate();
                } else if (e.key === "Escape") {
                  setReplyTo(null);
                  setEditing(null);
                }
              }}
              rows={1}
              maxLength={LIMITS.messageBody}
              placeholder={`Message ${title}`}
              aria-label={`Message ${title}`}
              className="max-h-40 min-h-10 resize-none"
            />
            <Button type="submit" variant="primary" disabled={!draft.trim()} loading={sendMsg.isPending}>
              {editing ? "Save" : "Send"}
            </Button>
          </div>
        </form>
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} kind={kind} id={id} />
      <PinsDialog open={pinsOpen} onClose={() => setPinsOpen(false)} kind={kind} id={id} />
    </div>
  );
}

function MessageRow({ m, grouped, canModerate, isChannel, onReply, onEdit, upsert }: { m: MessageView; grouped: boolean; canModerate: boolean; isChannel: boolean; onReply: () => void; onEdit: () => void; upsert: (m: MessageView) => void }) {
  const me = useMe();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mine = m.author.id === me.id;
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: (r) => r && typeof r === "object" && "id" in r && upsert(r as MessageView),
    onError: (e) => toast.error("That didn't work", errorMessage(e)),
  });
  const react = (e: string) => {
    setEmoji(false);
    act.mutate(() => api<MessageView>(`/messages/${m.id}/reactions`, { body: { emoji: e } }));
  };

  return (
    <div className={cn("group relative flex gap-3 rounded-lg px-3 hover:bg-surface-2/60", grouped ? "py-0.5" : "mt-2 py-1")}>
      <div className="w-9 shrink-0">{!grouped && <Avatar user={m.author} size={36} />}</div>
      <div className="min-w-0 flex-1">
        {m.replyTo && (
          <p className="mb-0.5 flex items-center gap-1 truncate text-xs text-faint">
            <CornerUpLeft className="h-3 w-3" /> <b className="font-medium">{m.replyTo.author}</b> {m.replyTo.body}
          </p>
        )}
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <Link to={`/u/${m.author.username}`} className="text-sm font-semibold hover:underline">
              {m.author.displayName}
            </Link>
            <time className="text-[11px] text-faint" title={fullDate(m.createdAt)}>
              {relativeTime(m.createdAt)}
            </time>
            {m.pinned && <Pin className="h-3 w-3 text-accent" aria-label="Pinned" />}
          </div>
        )}
        {m.deleted ? <p className="text-sm italic text-faint">Message deleted.</p> : <RichText text={m.body} className="text-sm" />}
        {m.editedAt && !m.deleted && <span className="text-[10px] text-faint">(edited)</span>}
        {m.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button key={r.emoji} onClick={() => react(r.emoji)} aria-pressed={r.mine} className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", r.mine ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")}>
                {r.emoji} <span className="tabular-nums">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.deleted && (
        <div className={cn("absolute -top-3 right-3 hidden items-center rounded-lg border border-border bg-surface-2 shadow group-hover:flex focus-within:flex", (menu || emoji) && "flex")}>
          <button onClick={() => setEmoji((v) => !v)} className="p-1.5 text-faint hover:text-fg" aria-label="Add reaction">
            <SmilePlus className="h-4 w-4" />
          </button>
          <button onClick={onReply} className="p-1.5 text-faint hover:text-fg" aria-label="Reply">
            <CornerUpLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setMenu((v) => !v)} className="p-1.5 text-faint hover:text-fg" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {emoji && (
            <div className="absolute right-0 top-8 z-20 flex gap-1 rounded-full border border-border-strong bg-surface-2 p-1 shadow-xl">
              {QUICK.map((e) => (
                <button key={e} onClick={() => react(e)} className="rounded-full p-1 text-lg leading-none hover:bg-surface-3" aria-label={`React ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          )}
          {menu && (
            <div role="menu" className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-border-strong bg-surface-2 p-1 shadow-xl">
              {mine && (
                <button role="menuitem" onClick={() => (onEdit(), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              )}
              {(!isChannel || canModerate) && (
                <button role="menuitem" onClick={() => (act.mutate(() => api<MessageView>(`/messages/${m.id}/pin`, { body: { pinned: !m.pinned } })), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                  <Pin className="h-4 w-4" /> {m.pinned ? "Unpin" : "Pin"}
                </button>
              )}
              {(mine || canModerate) && (
                <button role="menuitem" onClick={() => (act.mutate(() => api(`/messages/${m.id}`, { method: "DELETE" }).then(() => upsert({ ...m, deleted: true, body: "" }))), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-danger hover:bg-surface-3">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              {!mine && (
                <button role="menuitem" onClick={() => (setReporting(true), setMenu(false))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-3 hover:text-fg">
                  <Flag className="h-4 w-4" /> Report
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="message" targetId={m.id} />
    </div>
  );
}

function SearchDialog({ open, onClose, kind, id }: { open: boolean; onClose: () => void; kind: Kind; id: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MessageView[] | null>(null);
  const run = useMutation({ mutationFn: () => api<MessageView[]>(`/${kind}/${id}/search?q=${encodeURIComponent(q)}`), onSuccess: setResults });
  return (
    <Dialog open={open} onClose={onClose} title="Search messages" wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) run.mutate();
        }}
        className="flex gap-2"
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this conversation…" aria-label="Search text" autoFocus />
        <Button type="submit" variant="primary" loading={run.isPending}>
          Search
        </Button>
      </form>
      <ul className="sx-scroll mt-4 max-h-96 space-y-2 overflow-y-auto">
        {results?.length === 0 && <li className="text-sm text-faint">No messages match.</li>}
        {results?.map((m) => (
          <li key={m.id} className="rounded-lg border border-border p-2.5">
            <p className="text-xs text-faint">
              {m.author.displayName} · {fullDate(m.createdAt)}
            </p>
            <RichText text={m.body} className="text-sm" />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function PinsDialog({ open, onClose, kind, id }: { open: boolean; onClose: () => void; kind: Kind; id: string }) {
  const [pins, setPins] = useState<MessageView[] | null>(null);
  useEffect(() => {
    if (open) void api<MessageView[]>(`/${kind}/${id}/pins`).then(setPins);
  }, [open, kind, id]);
  return (
    <Dialog open={open} onClose={onClose} title="Pinned messages" wide>
      {!pins ? (
        <Spinner />
      ) : pins.length === 0 ? (
        <p className="text-sm text-faint">Nothing pinned yet.</p>
      ) : (
        <ul className="sx-scroll max-h-96 space-y-2 overflow-y-auto">
          {pins.map((m) => (
            <li key={m.id} className="rounded-lg border border-border p-2.5">
              <p className="text-xs text-faint">
                {m.author.displayName} · {fullDate(m.createdAt)}
              </p>
              <RichText text={m.body} className="text-sm" />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
