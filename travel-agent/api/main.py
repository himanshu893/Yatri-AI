"""
FastAPI service: versioned JSON API so the UI can be swapped without
touching the LangGraph agent.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# Load env from repo root and travel-agent before importing agent code
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT.parent / ".env")
load_dotenv(_ROOT / ".env")

from agent.graph import app as graph_app
from agent.itinerary_places import extract_place_candidates_from_itinerary
from agent.tools import (
    geocode_hotels_for_map,
    geocode_itinerary_stops_serpapi,
    search_destination_candidates,
)

from api.schemas import (
    DestinationCandidate,
    DestinationSearchResponse,
    MapWaypoint,
    MapWaypointsRequest,
    MapWaypointsResponse,
    TripPlanRequest,
    TripPlanResponse,
)


def _synthetic_user_message(req: TripPlanRequest) -> str:
    """Reuses existing extract_node regex + LLM without changing graph logic."""
    month = (req.travel_month or "").strip()
    place = (req.destination_label or req.destination).strip()
    parts = [
        f"Plan a trip to {place}",
        f"budget {req.budget} INR",
    ]
    if month:
        parts.append(month.lower())
    parts.append(f"{req.num_people} people")
    parts.append(f"{req.nights} nights")
    if req.origin:
        parts.append(f"from {req.origin.strip()}")
    return ", ".join(parts)


def _state_from_request(req: TripPlanRequest) -> dict:
    return {
        "destination": req.destination.strip(),
        "budget": None,
        "travel_month": None,
        "num_people": None,
        "nights": None,
        "origin": None,
        "destination_lat": req.destination_latitude,
        "destination_lng": req.destination_longitude,
        "destination_label": req.destination_label,
        "weather_data": None,
        "hotel_price_trend": None,
        "current_situation": None,
        "season_info": None,
        "hotel_budget": None,
        "transport_budget": None,
        "food_budget": None,
        "activities_budget": None,
        "budget_reasoning": None,
        "hotels": [],
        "transport_options": [],
        "places_to_visit": [],
        "replan_count": 0,
        "replan_flag": False,
        "replan_reason": None,
        "itinerary": None,
        "warnings": [],
        "budget_breakdown": None,
        "ask_user_flag": False,
        "chat_history": [{"role": "user", "content": _synthetic_user_message(req)}],
        "extracted_entities": {},
        "tavily_calls": 0,
        "groq_calls": 0,
    }


def _build_response(result: dict) -> TripPlanResponse:
    itinerary = result.get("itinerary") or ""
    dest = result.get("destination") or ""
    queries = extract_place_candidates_from_itinerary(itinerary)
    waypoints_raw = geocode_itinerary_stops_serpapi(queries, dest) if queries else []
    hotels = result.get("hotels") or []
    hotel_pins_raw = geocode_hotels_for_map(hotels, dest) if hotels else []

    waypoints = [
        MapWaypoint(
            order=w["order"],
            query=w["query"],
            name=w["name"],
            lat=w["lat"],
            lng=w["lng"],
            address=w.get("address"),
        )
        for w in waypoints_raw
    ]
    hotel_map_pins = [
        MapWaypoint(
            order=w["order"],
            query=w["query"],
            name=w["name"],
            lat=w["lat"],
            lng=w["lng"],
            address=w.get("address"),
        )
        for w in hotel_pins_raw
    ]

    return TripPlanResponse(
        destination=result.get("destination"),
        destination_label=result.get("destination_label"),
        budget=result.get("budget"),
        travel_month=result.get("travel_month"),
        num_people=result.get("num_people"),
        nights=result.get("nights"),
        origin=result.get("origin"),
        weather_data=result.get("weather_data"),
        hotel_price_trend=result.get("hotel_price_trend"),
        current_situation=result.get("current_situation"),
        season_info=result.get("season_info"),
        hotel_budget=result.get("hotel_budget"),
        transport_budget=result.get("transport_budget"),
        food_budget=result.get("food_budget"),
        activities_budget=result.get("activities_budget"),
        budget_reasoning=result.get("budget_reasoning"),
        hotels=result.get("hotels") or [],
        transport_options=result.get("transport_options") or [],
        warnings=result.get("warnings") or [],
        itinerary=result.get("itinerary"),
        budget_breakdown=result.get("budget_breakdown"),
        itinerary_place_queries=queries,
        map_waypoints=waypoints,
        hotel_map_pins=hotel_map_pins,
        ask_user_flag=bool(result.get("ask_user_flag")),
        replan_count=int(result.get("replan_count") or 0),
    )


app = FastAPI(title="Yatri Travel Agent API", version="1.0.0")

_origins = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/destinations/search", response_model=DestinationSearchResponse)
def destinations_search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Top geographic matches (Open-Meteo) plus related Google Maps places (SerpAPI)
    so the user can pick the exact stop in the UI — no terminal input.
    """
    raw = search_destination_candidates(q.strip(), per_source=limit, max_total=limit * 2)
    def _fnum(v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    candidates = [
        DestinationCandidate(
            id=c["id"],
            name=c["name"],
            label=c["label"],
            lat=c["lat"],
            lng=c["lng"],
            source=c["source"],
            region=c.get("region"),
            country=c.get("country"),
            population=c.get("population"),
            address=c.get("address"),
            rating=_fnum(c.get("rating")),
            reviews=c.get("reviews") if isinstance(c.get("reviews"), int) else None,
        )
        for c in raw
    ]
    return DestinationSearchResponse(query=q.strip(), candidates=candidates)


@app.post("/api/v1/plan", response_model=TripPlanResponse)
def plan_trip(body: TripPlanRequest):
    initial = _state_from_request(body)
    result = graph_app.invoke(initial)
    return _build_response(result)


@app.post("/api/v1/map-waypoints", response_model=MapWaypointsResponse)
def map_waypoints_only(body: MapWaypointsRequest):
    raw = geocode_itinerary_stops_serpapi(body.places, body.destination)
    return MapWaypointsResponse(
        waypoints=[
            MapWaypoint(
                order=w["order"],
                query=w["query"],
                name=w["name"],
                lat=w["lat"],
                lng=w["lng"],
                address=w.get("address"),
            )
            for w in raw
        ]
    )
