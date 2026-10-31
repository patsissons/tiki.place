"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { SITE } from "@/lib/seo";

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-bg/70 text-fg backdrop-blur sm:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 top-3 z-50 rounded-2xl border border-line bg-bg-elevated p-4 shadow-2xl focus:outline-none">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-lg font-semibold">{SITE.name}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="rounded-full p-2 text-fg-muted hover:text-fg" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <nav className="mt-3 flex flex-col">
            {links.map((l) => (
              <Dialog.Close asChild key={l.href}>
                <Link href={l.href} className="rounded-xl px-3 py-3 text-base hover:bg-fg/8">
                  {l.label}
                </Link>
              </Dialog.Close>
            ))}
            <Dialog.Close asChild>
              <Link href="/submit" className="mt-2 rounded-full bg-amber px-4 py-3 text-center font-medium text-[#1a1206]">
                Suggest a bar
              </Link>
            </Dialog.Close>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
