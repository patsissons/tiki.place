import { getPublishedPlaces } from "@/lib/data/places";
import { llmsTxt } from "@/lib/llms";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsTxt(getPublishedPlaces().length), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
