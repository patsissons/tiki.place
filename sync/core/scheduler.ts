/** Google budget ledger and the daily verification plan. */
import type { GoogleSku, Ledger, Place, SkuCounts } from "@/lib/schema";

const DAY = 86_400_000;

export type BudgetOptions = {
  monthlyFree: SkuCounts;
  /** Hard per-day cap for text search (discovery resolution). */
  textSearchDailyCap: number;
  /** Fraction of the pro-rated monthly allowance a single day may use. */
  dailyShare?: number;
  /** Stop at this fraction of the month's free allowance. */
  monthlyStop?: number;
};

export class GoogleBudget {
  private readonly day: string;
  private readonly month: string;
  constructor(
    readonly ledger: Ledger,
    readonly options: BudgetOptions,
    now: Date,
  ) {
    this.day = now.toISOString().slice(0, 10);
    this.month = this.day.slice(0, 7);
    this.ledger.days[this.day] ??= { essentials: 0, pro: 0, enterprise: 0, textSearch: 0 };
    this.ledger.months[this.month] ??= { essentials: 0, pro: 0, enterprise: 0, textSearch: 0 };
    // prune old days
    const cutoff = new Date(now.getTime() - 62 * DAY).toISOString().slice(0, 10);
    for (const d of Object.keys(this.ledger.days)) if (d < cutoff) delete this.ledger.days[d];
  }

  private get today() {
    return this.ledger.days[this.day]!;
  }
  private get thisMonth() {
    return this.ledger.months[this.month]!;
  }

  /** Text search is billed on the Pro SKU; the ledger tracks it separately for visibility. */
  private billedSku(sku: GoogleSku): Exclude<GoogleSku, "textSearch"> {
    return sku === "textSearch" ? "pro" : sku;
  }

  dailyCap(sku: GoogleSku): number {
    const billed = this.billedSku(sku);
    const share = this.options.dailyShare ?? 0.85;
    const cap = Math.floor((this.options.monthlyFree[billed] / 31) * share);
    return sku === "textSearch" ? Math.min(cap, this.options.textSearchDailyCap) : cap;
  }

  spentToday(sku: GoogleSku): number {
    const billed = this.billedSku(sku);
    return sku === "textSearch" ? this.today.textSearch : this.today[billed] + (billed === "pro" ? this.today.textSearch : 0);
  }

  spentThisMonth(sku: GoogleSku): number {
    const billed = this.billedSku(sku);
    return this.thisMonth[billed] + (billed === "pro" ? this.thisMonth.textSearch : 0);
  }

  canSpend(sku: GoogleSku, n = 1): boolean {
    const billed = this.billedSku(sku);
    const monthlyStop = Math.floor(this.options.monthlyFree[billed] * (this.options.monthlyStop ?? 0.9));
    if (this.spentThisMonth(sku) + n > monthlyStop) return false;
    if (sku === "textSearch" && this.today.textSearch + n > this.dailyCap("textSearch")) return false;
    const proDaily = this.dailyCap(billed);
    const todayBilled = this.today[billed] + (billed === "pro" ? this.today.textSearch : 0);
    return todayBilled + n <= proDaily;
  }

  remainingToday(sku: GoogleSku): number {
    let n = 0;
    while (n < 10_000 && this.canSpend(sku, n + 1)) n++;
    return n;
  }

  spend(sku: GoogleSku, n = 1) {
    this.today[sku] += n;
    this.thisMonth[sku] += n;
  }
}

export type GooglePlan = {
  resolve: Place[];
  refresh: Place[];
  statusCheck: Place[];
};

export type PlanOptions = {
  /** Re-attempt resolution after this many days. */
  resolveRetryDays?: number;
  /** Status check places whose Google data is older than this. */
  statusCheckDays?: number;
  lastGoogleSeenAt: (place: Place) => string | undefined;
};

export function planGoogleWork(places: Place[], budget: GoogleBudget, now: Date, options: PlanOptions): GooglePlan {
  const { resolveRetryDays = 90, statusCheckDays = 14, lastGoogleSeenAt } = options;
  const age = (iso?: string) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : Infinity);
  const active = places.filter((p) => p.review.state !== "rejected");

  const resolve = active
    .filter((p) => !p.externalIds.google && (!p.resolution || age(p.resolution.attemptedAt) > resolveRetryDays))
    .sort((a, b) => b.tikiConfidence - a.tikiConfidence || a.firstSeenAt.localeCompare(b.firstSeenAt))
    .slice(0, budget.remainingToday("textSearch"));

  const withGoogle = active.filter((p) => p.externalIds.google);
  const refresh = [...withGoogle]
    .sort((a, b) => (a.lastVerifiedAt ?? "").localeCompare(b.lastVerifiedAt ?? ""))
    .slice(0, budget.remainingToday("enterprise"));
  const refreshing = new Set(refresh.map((p) => p.id));

  const statusCheck = withGoogle
    .filter((p) => !refreshing.has(p.id) && age(lastGoogleSeenAt(p)) > statusCheckDays)
    .sort((a, b) => (lastGoogleSeenAt(a) ?? "").localeCompare(lastGoogleSeenAt(b) ?? ""))
    .slice(0, Math.max(0, budget.remainingToday("pro") - resolve.length));

  return { resolve, refresh, statusCheck };
}
