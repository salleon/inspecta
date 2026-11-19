// What this phone's plan allows (claude-project/SPLIT_PLAN.md, "Later"):
// the Contractor app will be free with paid tiers for pro features. Not
// sold yet, so every phone has everything. Later a store subscription
// sets the plan, and paid features check hasFeature() here, never the
// plan or the app directly, so the tiers stay in one place.
export type Plan = "free" | "pro";

// the EnFact app always has every feature, and so does Contractor for now
export const currentPlan = (): Plan => "pro";

// none yet; add each paid feature here as it's built
export type Feature = never;

export const hasFeature = (_feature: Feature): boolean => currentPlan() === "pro";
