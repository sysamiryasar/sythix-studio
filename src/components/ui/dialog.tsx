"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { Input } from "./field";
import { cn } from "@/lib/cn";

/** Accessible modal built on the native <dialog> element (focus trap and Esc handling included). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(94vw,var(--w))] rounded-lg border border-border-strong bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px] open:animate-pop-in",
      )}
      style={{ ["--w" as string]: size === "sm" ? "400px" : size === "lg" ? "760px" : "540px" }}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <div className="mt-1 text-sm text-muted">{description}</div>}
            </div>
            <button aria-label="Close" onClick={onClose} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children && <div className="sx-scroll overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmation for destructive or production-impacting actions. With
 * `confirmText`, the user must type it exactly before the action is enabled.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmText,
  danger,
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = !!confirmText && typed !== confirmText;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={blocked} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {confirmText && (
        <label className="mt-2 block text-xs text-muted">
          Type <span className="font-mono text-fg">{confirmText}</span> to confirm
          <Input className="mt-1.5 font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      )}
    </Dialog>
  );
}
