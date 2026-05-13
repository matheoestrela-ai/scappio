// Centralized plan + Stripe price configuration.
// Price IDs are public (safe to ship in client bundle).

export type Plan = "free" | "creator" | "studio" | "lifetime";

export const STRIPE_PRICES = {
  creator_monthly: "price_1TWgZ9Fjlt1yiQGFO4VizMuB",
  creator_annual:  "price_1TWgZfFjlt1yiQGF79uXnZfu",
  studio_monthly:  "price_1TWgaIFjlt1yiQGFAz7qALSH",
  studio_annual:   "price_1TWgcFFjlt1yiQGFYYHKXgGJ",
  lifetime:        "price_1TWgcWFjlt1yiQGFRJvY2hMV",
} as const;

export type PriceKey = keyof typeof STRIPE_PRICES;

// Map a Stripe price ID back to the plan it grants.
export const PRICE_TO_PLAN: Record<string, Plan> = {
  [STRIPE_PRICES.creator_monthly]: "creator",
  [STRIPE_PRICES.creator_annual]:  "creator",
  [STRIPE_PRICES.studio_monthly]:  "studio",
  [STRIPE_PRICES.studio_annual]:   "studio",
  [STRIPE_PRICES.lifetime]:        "lifetime",
};

export const FREE_BOARD_LIMIT = 4;
export const FREE_RECORDING_LIMIT = 10;

export const isPaidPlan = (p: Plan | undefined | null) =>
  p === "creator" || p === "studio" || p === "lifetime";

export const hasAgentAI = isPaidPlan;
export const hasUnlimitedBoards = isPaidPlan;
export const hasUnlimitedRecordings = isPaidPlan;
export const exportsHaveWatermark = (p: Plan | undefined | null) => !isPaidPlan(p);
