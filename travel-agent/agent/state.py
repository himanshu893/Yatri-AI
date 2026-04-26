from typing import TypedDict, List, Dict, Any, Optional

class WeatherData(TypedDict):
    temp: str
    snowfall: bool
    rainfall: bool        # add this — monsoon season matters
    sunset_time: str      # add this — critical for safety constraints

class Hotel(TypedDict):
    name: str
    price: int
    rating: float         # add this — agent should recommend best rated
    location: str         # add this — Mall Road vs outskirts matters

class TransportOption(TypedDict):  # add this entire class
    type: str             # "train" or "bus"
    name: str
    fare: int
    duration: str
    route: str
    code: str
    classes: List[Dict[str, str]]

class AgentState(TypedDict):
    
    # ── User inputs ────────────────────────
    destination: str
    budget: int
    travel_month: Optional[str]    # add — December vs April changes everything
    num_people: Optional[int]      # add — 1 person vs 4 people changes budget
    origin: Optional[str]          # add — where they're travelling FROM

    # ── Research ───────────────────────────
    weather_data: Optional[WeatherData]
    hotel_price_trend: Optional[str]
    current_situation: Optional[str]   # add — road blocks, news alerts
    season_info: Optional[str]         # add — what this month means safety-wise

    # ── Budget split ───────────────────────
    hotel_budget: Optional[int]
    transport_budget: Optional[int]
    food_budget: Optional[int]         # add — you had this missing
    activities_budget: Optional[int]   # add — you had this missing
    budget_reasoning: Optional[str]    # add — WHY agent split this way

    # ── Search results ─────────────────────
    hotels: List[Hotel]
    transport_options: List[TransportOption]  # add — you had this missing
    transport_by_mode: Optional[Dict[str, List[TransportOption]]]
    places_to_visit: Optional[List[str]]      # add — recommendations

    # ── Replanning ─────────────────────────
    replan_count: int              # add — track how many times replanned
    replan_flag: bool              # add — True = go replan, False = go itinerary
    replan_reason: Optional[str]   # add — why replan happened
    ask_user_flag: bool            # add — True = stop and ask user for missing info

    # ── Final output ───────────────────────
    itinerary: Optional[str]
    itinerary_place_queries: Optional[List[str]]
    map_waypoints: Optional[List[Dict[str, Any]]]
    hotel_map_pins: Optional[List[Dict[str, Any]]]
    route_map_url: Optional[str]
    warnings: List[str]
    budget_breakdown: Optional[Dict]   # add — clean summary for Streamlit UI

    # ── Chat memory ────────────────────────
    chat_history: Optional[List]       # add — for "that place" context
    extracted_entities: Optional[Dict] # add — running dict of what agent knows

    # ── API counters ────────────────────────
    tavily_calls: int                 # tracker for Tavily calls
    groq_calls: int                   # tracker for Groq calls
