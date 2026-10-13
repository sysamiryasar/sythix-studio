import { Fragment } from "react";

/** Minimal, safe Markdown renderer for the bundled changelog (headings, lists, paragraphs, inline code/links). No HTML passthrough. */
export function Markdown({ source }: { source: string }) {
  const inline = (text: string) =>
    text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
      if (part.startsWith("`")) return <code key={i} className="rounded bg-surface-3 px-1 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link && /^https?:\/\//.test(link[2]!)) return <a key={i} href={link[2]} className="text-accent hover:underline" rel="noreferrer noopener" target="_blank">{link[1]}</a>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="mb-3 text-sm text-muted">{inline(para.join(" "))}</p>);
    para = [];
  };
  for (const line of source.split("\n")) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      flushPara();
      const cls = h[1]!.length === 1 ? "mb-3 text-lg font-semibold" : h[1]!.length === 2 ? "mb-2 mt-5 text-base font-semibold text-fg" : "mb-1.5 mt-3 text-sm font-semibold text-fg";
      blocks.push(<div key={blocks.length} className={cls}>{inline(h[2]!)}</div>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^\s{2,}\S/.test(line) && list.length) {
      list[list.length - 1] += " " + line.trim();
    } else if (!line.trim()) {
      flush();
      flushPara();
    } else {
      flush();
      para.push(line.trim());
    }
  }
  flush();
  flushPara();
  return <div>{blocks}</div>;
}
