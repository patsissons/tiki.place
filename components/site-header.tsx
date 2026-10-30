import Link from "next/link";
import { cn } from "@/lib/utils";
import { MobileMenu } from "./mobile-menu";

const links = [
  { href: "/", label: "Explore" },
  { href: "/cities", label: "Cities" },
  { href: "/sources", label: "Sources" },
  { href: "/about", label: "About" },
];

export function SiteHeader({ className, overlay = false }: { className?: string; overlay?: boolean }) {
  return (
    <header
      className={cn(
        "z-30 flex h-14 items-center justify-between gap-4 px-4 sm:px-6",
        overlay ? "pointer-events-none absolute inset-x-0 top-0" : "border-b border-line bg-bg/80 backdrop-blur",
        className,
      )}
    >
      <Link href="/" className={cn("pointer-events-auto flex items-center gap-2 rounded-full px-2 py-1", overlay && "bg-bg/70 backdrop-blur")}>
        <Torch />
        <span className="font-display text-lg font-semibold tracking-tight">tiki.place</span>
      </Link>
      <nav className={cn("pointer-events-auto hidden items-center gap-1 rounded-full text-sm sm:flex", overlay && "bg-bg/70 px-1 backdrop-blur")}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 text-fg-muted transition-colors hover:bg-fg/8 hover:text-fg">
            {l.label}
          </Link>
        ))}
        <Link href="/submit" className="ml-1 rounded-full bg-amber px-3 py-1.5 font-medium text-[#1a1206] hover:bg-amber/90">
          Suggest a bar
        </Link>
      </nav>
      <MobileMenu links={links} />
    </header>
  );
}

function Torch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="text-amber">
      <path d="M12 2c1.5 2.4 3 4 3 6.5a3 3 0 1 1-6 0C9 6 10.5 4.4 12 2Z" fill="currentColor" opacity=".9" />
      <path d="M9.5 12.5h5l-1 9h-3l-1-9Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}
