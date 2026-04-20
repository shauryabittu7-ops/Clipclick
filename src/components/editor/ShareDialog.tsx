"use client";

import { useState } from "react";
import { X, Copy, Check, Link2 } from "lucide-react";
import { useEditor } from "@/lib/state/editorStore";

export default function ShareDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const timeline = useEditor((s) => s.timeline);
  const [copied, setCopied] = useState(false);
  const [access, setAccess] = useState<"private" | "unlisted" | "public">("unlisted");

  if (!open || !timeline) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/share/${timeline.projectId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // noop
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="w-[460px] panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 size={18} /> Share project
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded hover:bg-[var(--bg-panel)] text-[var(--fg-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {(["private", "unlisted", "public"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAccess(a)}
              className={`h-9 rounded border text-xs font-semibold capitalize ${
                access === a
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                  : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            className="flex-1 h-9 px-3 rounded-md bg-[var(--bg-panel)] border border-[var(--border-strong)] font-mono text-xs"
          />
          <button
            onClick={copy}
            className="h-9 px-3 rounded-md btn-accent text-xs font-semibold flex items-center gap-1.5"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="text-[11px] text-[var(--fg-muted)]">
          Recipients join the same Yjs room and see live cursors.
          {access === "private"
            ? " Private links never sync — reserved for your devices."
            : access === "unlisted"
              ? " Anyone with the link can view in read-only mode."
              : " Discoverable; anyone can view."}
        </p>
      </div>
    </div>
  );
}
