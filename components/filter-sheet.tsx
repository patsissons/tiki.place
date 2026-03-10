"use client";

import type { CSSProperties } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import type { TikiFilters } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  sheetGlassClassName,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";

type FilterSheetProps = {
  filters: TikiFilters;
  onFiltersChange: (filters: TikiFilters) => void;
  triggerClassName?: string;
  contentClassName?: string;
  contentStyle?: CSSProperties;
};

export function FilterSheet({
  filters,
  onFiltersChange,
  triggerClassName,
  contentClassName,
  contentStyle,
}: FilterSheetProps) {
  return (
    <Sheet modal={false}>
      <SheetTrigger asChild>
        <Button className={triggerClassName}>
          <SlidersHorizontal className="h-4 w-4" />
          Search & Filter
        </Button>
      </SheetTrigger>
      <SheetContent
        hideOverlay
        style={contentStyle}
        className={cn(
          `sm:inset-x-0 sm:bottom-4 sm:top-auto sm:left-1/2 sm:right-auto sm:w-[min(640px,calc(100vw-2rem))] sm:max-h-[min(75vh,calc(var(--app-dvh)-2rem))] sm:-translate-x-1/2 ${sheetGlassClassName}`,
          contentClassName,
        )}
      >
        <SheetHeader>
          <SheetTitle>Dial in the map</SheetTitle>
          <SheetDescription>
            Filter by title, minimum rating, and a date/time window interpreted in each venue&apos;s local time.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="search">Name search</Label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                className="pl-10"
                placeholder="Smuggler, Trader, Latitude..."
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    search: event.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="minimum-rating">Minimum rating</Label>
              <span className="font-mono text-sm">{filters.minimumRating.toFixed(1)}+</span>
            </div>
            <Slider
              id="minimum-rating"
              min={0}
              max={5}
              step={0.1}
              value={[filters.minimumRating]}
              onValueChange={([minimumRating]) =>
                onFiltersChange({
                  ...filters,
                  minimumRating: minimumRating ?? 0,
                })
              }
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="start-local">Open for entire range</Label>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
              <Input
                id="start-local"
                type="datetime-local"
                className="min-w-0 w-full appearance-none text-left"
                value={filters.startLocal ?? ""}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    startLocal: event.target.value || undefined,
                  })
                }
              />
              <Input
                id="end-local"
                type="datetime-local"
                className="min-w-0 w-full appearance-none text-left"
                value={filters.endLocal ?? ""}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    endLocal: event.target.value || undefined,
                  })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The chosen window is matched against each bar&apos;s own local schedule.
            </p>
          </div>

          <Button
            className="w-full sm:w-auto"
            onClick={() =>
              onFiltersChange({
                search: "",
                minimumRating: 0,
                startLocal: undefined,
                endLocal: undefined,
              })
            }
          >
            Clear filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
