import { Suspense } from "react";

import { TikiExplorer } from "@/components/tiki-explorer";
import { getTikiBars } from "@/lib/data";

export default async function HomePage() {
  const bars = await getTikiBars();

  return (
    <Suspense fallback={null}>
      <TikiExplorer bars={bars} />
    </Suspense>
  );
}
