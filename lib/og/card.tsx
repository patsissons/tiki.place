/**
 * Shared building blocks for the Open Graph cards rendered by the opengraph-image routes.
 *
 * Everything here runs through Satori (`next/og`), so: inline styles only, `display: flex` on every
 * element with more than one child, no CSS variables, no Tailwind, fonts as ttf/otf/woff buffers.
 * Assets are read once per process at module scope, as the Next docs recommend; the paths are literal
 * so output file tracing includes them in the build.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { SITE } from "@/lib/seo";
import { OG_SIZE, headlineSize, type Fact } from "./text";
import { Torch } from "./torch";

export { Torch };
export const size = OG_SIZE;
export const contentType = "image/png";

export const C = {
  bg: "#0b1416",
  fg: "#f3e9d2",
  muted: "#a9b4ae",
  amber: "#f2a93b",
  line: "rgba(243, 233, 210, 0.16)",
} as const;

const DISPLAY = "Fraunces, Geist, serif";
const SANS = "'Instrument Sans', Geist, sans-serif";

async function optional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

const sky = await optional(join(process.cwd(), "assets/og/sky.jpg"));
const skySrc = sky ? `data:image/jpeg;base64,${sky.toString("base64")}` : null;

const [fraunces, sansRegular, sansMedium] = await Promise.all([
  optional(join(process.cwd(), "assets/og/Fraunces-SemiBold.ttf")),
  optional(join(process.cwd(), "assets/og/InstrumentSans-Regular.ttf")),
  optional(join(process.cwd(), "assets/og/InstrumentSans-Medium.ttf")),
]);

/** `fonts` option for ImageResponse. Undefined when the files are missing, which falls back to Geist. */
export const fonts =
  fraunces && sansRegular && sansMedium
    ? [
        { name: "Fraunces", data: fraunces, weight: 600 as const, style: "normal" as const },
        { name: "Instrument Sans", data: sansRegular, weight: 400 as const, style: "normal" as const },
        { name: "Instrument Sans", data: sansMedium, weight: 500 as const, style: "normal" as const },
      ]
    : undefined;

if (!fonts || !skySrc) console.warn("[og] assets/og is incomplete; cards will use fallback fonts or a plain background");

/** ImageResponse options shared by every card. */
export const options = { ...size, fonts };

/** Sky backdrop, legibility gradient and the padded content column with the wordmark footer. */
export function Frame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: SANS, color: C.fg, background: C.bg }}>
      {skySrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
        <img src={skySrc} width={1200} height={630} alt="" style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          display: "flex",
          background: "linear-gradient(180deg, rgba(3,7,10,0.22) 0%, rgba(3,7,10,0.62) 52%, rgba(3,7,10,0.90) 100%)",
        }}
      />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 6, display: "flex", background: `linear-gradient(90deg, ${C.amber} 0%, rgba(242,169,59,0) 70%)` }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: "56px 64px 48px" }}>
        {children}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Torch size={34} />
            <span style={{ fontFamily: DISPLAY, fontSize: 30, letterSpacing: -0.5 }}>{SITE.domain}</span>
          </div>
          {footer ? <div style={{ display: "flex", fontSize: 24, color: C.muted }}>{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Eyebrow({ text, color = C.amber }: { text: string; color?: string }) {
  return <div style={{ display: "flex", fontSize: 22, fontWeight: 500, letterSpacing: 4, textTransform: "uppercase", color }}>{text}</div>;
}

export function Headline({ text, size: fontSize = headlineSize(text) }: { text: string; size?: number }) {
  return <div style={{ display: "flex", fontFamily: DISPLAY, fontSize, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 1072, textWrap: "balance" }}>{text}</div>;
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, border: `2px solid ${color}`, color, fontSize: 22, fontWeight: 500 }}>
      <div style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "flex" }} />
      {label}
    </div>
  );
}

function Star({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={C.amber}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" />
    </svg>
  );
}

/** Rating, price and year as a muted row; the rating carries a drawn star rather than a glyph. */
export function Facts({ items, size: fontSize = 26 }: { items: Fact[]; size?: number }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, fontSize, color: C.muted }}>
      {items.map((f) => (
        <div key={f.kind} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {f.kind === "rating" ? <Star size={fontSize} /> : null}
          <span style={{ display: "flex" }}>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Plain text row for list cards ("12 verified places · United States"). */
export function Line({ items, size: fontSize = 30, color = C.muted }: { items: (string | undefined)[]; size?: number; color?: string }) {
  const parts = items.filter((x): x is string => Boolean(x));
  return <div style={{ display: "flex", fontSize: fontSize, color }}>{parts.join(" · ")}</div>;
}
