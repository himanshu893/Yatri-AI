export type MapWaypoint = {
  order: number;
  query: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
};

export type DestinationCandidate = {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  source: string;
  region?: string | null;
  country?: string | null;
  population?: number | null;
  address?: string | null;
  rating?: number | null;
  reviews?: number | null;
};

export type DestinationSearchResponse = {
  query: string;
  candidates: DestinationCandidate[];
};

export type TripPlanRequest = {
  destination: string;
  budget: number;
  travel_month?: string | null;
  num_people: number;
  nights: number;
  origin?: string | null;
  /** Set when user picks from /destinations/search */
  destination_latitude?: number | null;
  destination_longitude?: number | null;
  destination_label?: string | null;
};

export type TripPlanResponse = {
  destination?: string | null;
  destination_label?: string | null;
  budget?: number | null;
  travel_month?: string | null;
  num_people?: number | null;
  nights?: number | null;
  origin?: string | null;
  weather_data?: Record<string, unknown> | null;
  hotel_price_trend?: string | null;
  current_situation?: string | null;
  season_info?: string | null;
  hotel_budget?: number | null;
  transport_budget?: number | null;
  food_budget?: number | null;
  activities_budget?: number | null;
  budget_reasoning?: string | null;
  hotels: Record<string, unknown>[];
  transport_options: Record<string, unknown>[];
  warnings: string[];
  itinerary?: string | null;
  budget_breakdown?: Record<string, number> | null;
  itinerary_place_queries: string[];
  map_waypoints: MapWaypoint[];
  ask_user_flag: boolean;
  replan_count: number;
};
