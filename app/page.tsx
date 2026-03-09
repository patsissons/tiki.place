import { TikiExplorer } from "@/components/tiki-explorer";
import { getTikiBars } from "@/lib/data";

export default async function HomePage() {
  const bars = await getTikiBars();

  return <TikiExplorer bars={bars} />;
}
