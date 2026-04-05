from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TripPlanRequest(BaseModel):
    """Structured trip input (TripAdvisor-style fields)."""

    destination: str = Field(..., min_length=1, max_length=200)
    budget: int = Field(..., ge=1000, le=5_000_000)
    travel_month: Optional[str] = Field(
        default=None,
        description="e.g. December, or full month name",
        max_length=32,
    )
    num_people: int = Field(default=2, ge=1, le=30)
    nights: int = Field(default=3, ge=1, le=60)
    origin: Optional[str] = Field(default="Delhi", max_length=120)
    destination_latitude: Optional[float] = Field(
        default=None,
        description="From /destinations/search — exact weather & context",
    )
    destination_longitude: Optional[float] = Field(default=None)
    destination_label: Optional[str] = Field(
        default=None,
        max_length=400,
        description="Full chosen label shown in the planner message",
    )


class DestinationCandidate(BaseModel):
    id: str
    name: str
    label: str
    lat: float
    lng: float
    source: str
    region: Optional[str] = None
    country: Optional[str] = None
    population: Optional[int] = None
    address: Optional[str] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None


class DestinationSearchResponse(BaseModel):
    query: str
    candidates: List[DestinationCandidate]


class MapWaypoint(BaseModel):
    order: int
    query: str
    name: str
    lat: float
    lng: float
    address: Optional[str] = None


class TripPlanResponse(BaseModel):
    """Stable contract for any client (web, mobile, etc.)."""

    destination: Optional[str] = None
    destination_label: Optional[str] = None
    budget: Optional[int] = None
    travel_month: Optional[str] = None
    num_people: Optional[int] = None
    nights: Optional[int] = None
    origin: Optional[str] = None
    weather_data: Optional[Dict[str, Any]] = None
    hotel_price_trend: Optional[str] = None
    current_situation: Optional[str] = None
    season_info: Optional[str] = None
    hotel_budget: Optional[int] = None
    transport_budget: Optional[int] = None
    food_budget: Optional[int] = None
    activities_budget: Optional[int] = None
    budget_reasoning: Optional[str] = None
    hotels: List[Dict[str, Any]] = Field(default_factory=list)
    transport_options: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    itinerary: Optional[str] = None
    budget_breakdown: Optional[Dict[str, Any]] = None
    itinerary_place_queries: List[str] = Field(default_factory=list)
    map_waypoints: List[MapWaypoint] = Field(default_factory=list)
    hotel_map_pins: List[MapWaypoint] = Field(
        default_factory=list,
        description="Hotels geocoded via SerpAPI for map layer",
    )
    ask_user_flag: bool = False
    replan_count: int = 0


class MapWaypointsRequest(BaseModel):
    """Geocode a list of place names without running the full agent."""

    destination: str = Field(..., min_length=1, max_length=200)
    places: List[str] = Field(..., min_length=1, max_length=25)


class MapWaypointsResponse(BaseModel):
    waypoints: List[MapWaypoint]
