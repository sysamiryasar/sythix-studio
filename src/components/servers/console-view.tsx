"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Send } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useServerCommand } from "./use-command";

interface Line {
  seq: number;
  ts: number;
  level: string;
  line: string;
}

export function ConsoleView({ serverId, online, canExecute, simulated }: { serverId: string; online: boolean; canExecute: boolean; simulated: boolean }) {
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState("");
  const [filter, setFilter] = useState("");
  const [cmd, setCmd] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [outputs, setOutputs] = useState<{ command: string; status: string; text: string }[]>([]);
  const lastSeq = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const { run, pending } = useServerCommand(serverId);
  const storageKey = `sythix.console.history.${serverId}`;

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    lastSeq.current = 0;
    setLines([]);
  }, [level]);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const poll = async () => {
      try {
        const rows = await api<Line[]>(`/api/v1/servers/${serverId}/console?after=${lastSeq.current}${level ? `&level=${level}` : ""}`);
        if (!alive || !rows.length) return;
        lastSeq.current = rows.at(-1)!.seq;
        setLines((l) => [...l, ...rows].slice(-1500));
      } catch {
        /* transient */
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverId, paused, level]);

  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const shown = useMemo(() => (filter ? lines.filter((l) => l.line.toLowerCase().includes(filter.toLowerCase())) : lines), [lines, filter]);

  const send = async () => {
    const c = cmd.trim();
    if (!c) return;
    const next = [c, ...history.filter((h) => h !== c)].slice(0, 50);
    setHistory(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setCmd("");
    setHIdx(-1);
    try {
      const r = await run<{ output: string }>("console", { command: c });
      setOutputs((o) => [{ command: c, status: r.status, text: r.status === "succeeded" ? r.data?.output || "(no output)" : r.error ?? "" }, ...o].slice(0, 20));
    } catch (e) {
      toast.error("Command not sent", (e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Log level" className="w-32" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </Select>
        <Input aria-label="Filter output" placeholder="Filter…" className="w-56" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button size="sm" variant="ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />} {paused ? "Resume" : "Pause"}
        </Button>
        <span className="ml-auto flex gap-1.5">
          {simulated && <Badge tone="warning">Simulated output</Badge>}
          {online ? <Badge tone="success">Live · polling every 2s</Badge> : <Badge tone="danger">Disconnected — showing stored log</Badge>}
        </span>
      </div>
      <div ref={box} role="log" aria-live="off" className="sx-scroll h-[55vh] overflow-y-auto rounded-lg border border-border bg-[#05050a] p-3 font-mono text-[12px] leading-5">
        {shown.length === 0 && <p className="text-faint">No console output stored yet.</p>}
        {shown.map((l) => (
          <div key={l.seq} className={cn("whitespace-pre-wrap break-all", l.level === "ERROR" ? "text-red-400" : l.level === "WARN" ? "text-amber-300" : "text-zinc-300")}>
            {l.line}
          </div>
        ))}
      </div>
      {canExecute ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Input
            aria-label="Console command"
            className="font-mono"
            placeholder={online ? "Type a command, e.g. say Hello (↑ for history)" : "Server disconnected — commands can't be sent"}
            disabled={!online}
            value={cmd}
            maxLength={256}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && history.length) {
                e.preventDefault();
                const i = Math.min(hIdx + 1, history.length - 1);
                setHIdx(i);
                setCmd(history[i]!);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const i = hIdx - 1;
                setHIdx(Math.max(i, -1));
                setCmd(i >= 0 ? history[i]! : "");
              }
            }}
          />
          <Button type="submit" variant="primary" loading={pending} disabled={!online || !cmd.trim()}>
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted">Your role can read the console but not run commands.</p>
      )}
      <p className="text-[11px] text-faint">Stop, restart, reload and operator commands are blocked remotely by both SythiX and the agent. Every command is recorded in the audit log.</p>
      {outputs.length > 0 && (
        <div className="space-y-1.5">
          {outputs.map((o, i) => (
            <div key={i} className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs">
              <span className="text-accent">&gt; {o.command}</span>{" "}
              <Badge tone={o.status === "succeeded" ? "success" : "danger"}>{o.status}</Badge>
              <div className="mt-1 whitespace-pre-wrap text-muted">{o.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
