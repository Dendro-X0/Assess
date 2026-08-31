import type { PlanTier } from "./db.js";

export type PlanLimits = {
  monthlyQuota: number;
  ratePerMinute: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { monthlyQuota: 20, ratePerMinute: 10 },
  pro: { monthlyQuota: 500, ratePerMinute: 60 },
};

export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}
