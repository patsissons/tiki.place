import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader className="sticky top-0" />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
