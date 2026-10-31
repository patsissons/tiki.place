import { ImageResponse } from "next/og";
import { Torch } from "@/lib/og/torch";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1416" }}>
      <Torch size={126} />
    </div>,
    size,
  );
}
