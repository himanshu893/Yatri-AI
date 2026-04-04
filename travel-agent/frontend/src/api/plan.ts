import type {
  DestinationSearchResponse,
  TripPlanRequest,
  TripPlanResponse,
} from "../types";

const jsonHeaders = { "Content-Type": "application/json" };

export function apiBase(): string {
  return import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "";
}

/** Pydantic expects snake_case JSON keys. */
function toPlanPayload(body: TripPlanRequest): Record<string, unknown> {
  const o: Record<string, unknown> = {
    destination: body.destination,
    budget: body.budget,
    num_people: body.num_people,
    nights: body.nights,
  };
  if (body.travel_month) o.travel_month = body.travel_month;
  if (body.origin) o.origin = body.origin;
  if (body.destination_latitude != null && body.destination_longitude != null) {
    o.destination_latitude = body.destination_latitude;
    o.destination_longitude = body.destination_longitude;
  }
  if (body.destination_label) o.destination_label = body.destination_label;
  return o;
}

export async function planTrip(body: TripPlanRequest): Promise<TripPlanResponse> {
  const url = `${apiBase()}/api/v1/plan`;
  const res = await fetch(url, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(toPlanPayload(body)),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Plan failed (${res.status})`);
  }
  return res.json() as Promise<TripPlanResponse>;
}

export async function searchDestinations(
  q: string,
  limit = 10,
): Promise<DestinationSearchResponse> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const url = `${apiBase()}/api/v1/destinations/search?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Search failed (${res.status})`);
  }
  return res.json() as Promise<DestinationSearchResponse>;
}
