import type { TripPlanRequest } from "../types";

const KEY = "yatri_landing_plan_draft";

export function setLandingDraft(draft: Partial<TripPlanRequest>) {
  sessionStorage.setItem(KEY, JSON.stringify(draft));
}

export function consumeLandingDraft(): Partial<TripPlanRequest> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as Partial<TripPlanRequest>;
  } catch {
    return null;
  }
}
