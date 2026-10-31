import { ImageResponse } from "next/og";
import { Torch } from "@/lib/og/torch";

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((n) => ({ id: String(n), size: { width: n, height: n }, contentType: "image/png" }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const n = Number(await id);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1416", borderRadius: n <= 32 ? Math.round(n * 0.22) : 0 }}>
      <Torch size={Math.round(n * 0.8)} />
    </div>,
    { width: n, height: n },
  );
}
