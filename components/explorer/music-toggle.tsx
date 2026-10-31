"use client";

import { Volume2, VolumeX } from "lucide-react";
import { setMusicEnabled, useMusicEnabled } from "@/lib/client/music";
import { cn } from "@/lib/utils";

/** Speaker button in the explorer header that turns the music on or off and remembers the choice. */
export function MusicToggle({ className }: { className?: string }) {
  const enabled = useMusicEnabled();
  return (
    <button
      type="button"
      data-music-toggle
      onClick={() => setMusicEnabled(!enabled)}
      className={cn("pointer-events-auto flex size-10 items-center justify-center rounded-full bg-bg/70 text-fg-muted backdrop-blur transition-colors hover:text-fg", className)}
      aria-label={enabled ? "Turn music off" : "Turn music on"}
    >
      {enabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
    </button>
  );
}
