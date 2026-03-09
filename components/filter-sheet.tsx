"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import type { ComponentProps } from "react";

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
  triggerVariant?: ComponentProps<typeof Button>["variant"];
};

export function FilterSheet({
  filters,
  onFiltersChange,
  triggerClassName,
  contentClassName,
  triggerVariant = "outline",
}: FilterSheetProps) {
  return (
    <Sheet modal={false}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} className={cn("bg-white/85", triggerClassName)}>
          <SlidersHorizontal className="h-4 w-4" />
          Search & Filter
        </Button>
      </SheetTrigger>
      <SheetContent
        hideOverlay
        className={cn(
          `sm:inset-x-0 sm:bottom-4 sm:top-auto sm:left-1/2 sm:right-auto sm:w-[min(640px,calc(100vw-2rem))] sm:max-h-[75vh] sm:-translate-x-1/2 ${sheetGlassClassName}`,
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
            <Input
              id="start-local"
              type="datetime-local"
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
              value={filters.endLocal ?? ""}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  endLocal: event.target.value || undefined,
                })
              }
            />
            <p className="text-sm text-muted-foreground">
              The chosen window is matched against each bar&apos;s own local schedule.
            </p>
          </div>

          <Button
            variant="ghost"
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
