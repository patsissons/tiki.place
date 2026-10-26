"use client";

import MiniSearch from "minisearch";
import { useEffect, useMemo, useState } from "react";
import type { PublishedPlace } from "../schema/published";
import { countryName } from "../utils";

export type PlacesState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; places: PublishedPlace[]; index: MiniSearch<PublishedPlace> };

export function buildIndex(places: PublishedPlace[]) {
  const index = new MiniSearch<PublishedPlace>({
    fields: ["name", "aliases", "locality", "region", "countryName"],
    storeFields: ["id"],
    extractField: (doc, field) => {
      if (field === "aliases") return doc.aliases.join(" ");
      if (field === "countryName") return countryName(doc.country) ?? "";
      const v = (doc as unknown as Record<string, unknown>)[field];
      return typeof v === "string" ? v : "";
    },
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { name: 3, aliases: 2 }, combineWith: "AND" },
  });
  index.addAll(places);
  return index;
}

export function usePlaces(hash: string): PlacesState {
  const [state, setState] = useState<PlacesState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/data/places.json?v=${hash}`)
      .then((r) => {
        if (!r.ok) throw new Error(`places.json ${r.status}`);
        return r.json() as Promise<PublishedPlace[]>;
      })
      .then((places) => {
        if (!cancelled) setState({ status: "ready", places, index: buildIndex(places) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);
  return state;
}

export function useSearch(state: PlacesState, query: string): PublishedPlace[] | null {
  return useMemo(() => {
    if (state.status !== "ready") return null;
    const q = query.trim();
    if (!q) return state.places;
    const byId = new Map(state.places.map((p) => [p.id, p]));
    return state.index
      .search(q)
      .map((r) => byId.get(r.id as string))
      .filter((p): p is PublishedPlace => Boolean(p));
  }, [state, query]);
}
