"use client";

import { useState } from "react";
import {
  Upload,
  Type,
  Music,
  Image as ImageIcon,
  Wand2,
  Palette,
  Shapes,
  Captions,
} from "lucide-react";
import UploadPanel from "./panels/UploadPanel";
import CaptionsPanel from "./panels/CaptionsPanel";
import AudioPanel from "./panels/AudioPanel";
import AIPanel from "./panels/AIPanel";
import ColorPanel from "./panels/ColorPanel";

const TABS = [
  { id: "upload", icon: Upload, label: "Upload" },
  { id: "captions", icon: Captions, label: "Captions" },
  { id: "text", icon: Type, label: "Text" },
  { id: "audio", icon: Music, label: "Audio" },
  { id: "images", icon: ImageIcon, label: "Images" },
  { id: "ai", icon: Wand2, label: "AI" },
  { id: "color", icon: Palette, label: "Color" },
  { id: "shapes", icon: Shapes, label: "Shapes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function LeftNav() {
  const [active, setActive] = useState<TabId>("upload");

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-[72px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-elevated)] flex flex-col py-2 gap-1 items-center">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              data-nav-tab={t.id}
              onClick={() => setActive(t.id)}
              className={`w-14 h-14 flex flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-[var(--bg-panel)] text-[var(--accent)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-panel)]"
              }`}
            >
              <Icon size={18} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <aside className="w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] overflow-y-auto p-4">
        {active === "upload" ? (
          <UploadPanel />
        ) : active === "captions" ? (
          <CaptionsPanel />
        ) : active === "audio" ? (
          <AudioPanel />
        ) : active === "ai" ? (
          <AIPanel />
        ) : active === "color" ? (
          <ColorPanel />
        ) : (
          <div className="text-sm text-[var(--fg-muted)]">
            <p className="font-semibold text-[var(--fg)] mb-2 capitalize">{active}</p>
            Coming in the next phase.
          </div>
        )}
      </aside>
    </div>
  );
}
