import type { TripPlanResponse } from "../types";

const STORAGE_KEY = "yatri_saved_trips_v1";

export type SavedTrip = {
  id: string;
  createdAt: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  status: "completed" | "draft" | "upcoming";
  response: TripPlanResponse;
};

function readRaw(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(trips: SavedTrip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

export function listTrips(): SavedTrip[] {
  return readRaw().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function getTrip(id: string): SavedTrip | null {
  return readRaw().find((t) => t.id === id) ?? null;
}

export function saveTrip(
  response: TripPlanResponse,
  opts?: { imageUrl?: string | null },
): SavedTrip {
  const trips = readRaw();
  const id = crypto.randomUUID();
  const title =
    response.destination_label ||
    response.destination ||
    "Untitled journey";
  const trip: SavedTrip = {
    id,
    createdAt: new Date().toISOString(),
    title,
    subtitle: response.travel_month
      ? `${response.travel_month} · ₹${(response.budget ?? 0).toLocaleString("en-IN")}`
      : `₹${(response.budget ?? 0).toLocaleString("en-IN")}`,
    imageUrl: opts?.imageUrl ?? null,
    status: "completed",
    response,
  };
  trips.unshift(trip);
  writeRaw(trips);
  return trip;
}

export function deleteTrip(id: string) {
  writeRaw(readRaw().filter((t) => t.id !== id));
}
