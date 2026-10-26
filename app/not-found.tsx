import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-fg-muted">404</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">No tiki here.</h1>
      <p className="mt-3 max-w-sm text-fg-muted">The page you wanted may have been renamed or merged into another place.</p>
      <Link href="/" className="mt-6 rounded-full bg-amber px-5 py-2 font-medium text-[#1a1206]">Back to the map</Link>
    </main>
  );
}
