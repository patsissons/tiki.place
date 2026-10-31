/** The torch mark from the site header, sized for Satori-rendered images (inline SVG, no CSS). */
export function Torch({ size = 64, color = "#f2a93b" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2c1.5 2.4 3 4 3 6.5a3 3 0 1 1-6 0C9 6 10.5 4.4 12 2Z" fill={color} opacity={0.9} />
      <path d="M9.5 12.5h5l-1 9h-3l-1-9Z" fill={color} opacity={0.55} />
    </svg>
  );
}
