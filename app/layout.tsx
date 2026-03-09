import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "tiki.place",
  description: "A map-first guide to tiki bars around the world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
