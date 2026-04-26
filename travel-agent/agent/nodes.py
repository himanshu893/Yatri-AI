import os
import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from groq import Groq
from dotenv import load_dotenv
from agent.state import AgentState
from agent.tools import (
    get_weather_data,
    get_hotel_prices_serpapi,
    get_hotel_prices_tavily,
    get_current_situation,
    get_transport_options,
    get_nearest_hub_serpapi,
    _resolve_nearby_transit_hubs,
    _build_taxi_transfer_option,
    reset_tavily_counter,
    _transport_type_priority,
)

TRAVEL_AGENT_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = TRAVEL_AGENT_DIR.parent
REPO_ENV = REPO_DIR / ".env"
TRAVEL_AGENT_ENV = TRAVEL_AGENT_DIR / ".env"

# Load both supported env locations. The travel-agent .env wins when both exist.
load_dotenv(REPO_ENV)
load_dotenv(TRAVEL_AGENT_ENV, override=True)

# ── Initialize Groq ───────────────────────────────────────
client: Optional[Groq] = None
_loaded_groq_api_key: Optional[str] = None


def _current_groq_api_key() -> Optional[str]:
    return os.getenv("GROQ_API") or os.getenv("GROQ_API_KEY")


def _get_groq_client() -> Optional[Groq]:
    global client, _loaded_groq_api_key

    # Re-read env files so restarting the API is enough after editing .env.
    load_dotenv(REPO_ENV)
    load_dotenv(TRAVEL_AGENT_ENV, override=True)

    groq_api_key = _current_groq_api_key()
    if not groq_api_key:
        print("⚠️  Missing Groq API key. Set GROQ_API or GROQ_API_KEY in travel-agent/.env.")
        client = None
        _loaded_groq_api_key = None
        return None

    if client is None or _loaded_groq_api_key != groq_api_key:
        client = Groq(api_key=groq_api_key)
        _loaded_groq_api_key = groq_api_key
    return client


_get_groq_client()

# ── API Counter ───────────────────────────────────────────
_groq_call_count = 0
GROQ_LIMIT       = 10

def reset_groq_counter():
    global _groq_call_count
    _groq_call_count = 0


_PLACE_ALIASES = {
    "mumabi": "Mumbai",
    "bombay": "Mumbai",
    "mumbai": "Mumbai",
    "nagpur": "Nagpur",
    "delhi": "Delhi",
    "new delhi": "Delhi",
}


def _clean_place_candidate(value: str) -> Optional[str]:
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" ,.")
    cleaned = re.sub(
        r"\b(?:budget|under|around|for|with|inr|rs|rupees|people|person|persons|pax|night|nights|day|days)\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
    if not cleaned:
        return None
    return _PLACE_ALIASES.get(cleaned.lower(), cleaned.title())


# ── Load System Prompt ────────────────────────────────────
PROMPT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "prompts", "system_prompt.txt")
)
with open(PROMPT_PATH, "r", encoding="utf-8") as f:
    system_prompt = f.read()

# ── Helper — LLM call ─────────────────────────────────────
def llm_call(prompt: str,
             model: str    = "llama-3.3-70b-versatile",
             json_mode: bool = False) -> str:
    global _groq_call_count

    groq_client = _get_groq_client()
    if groq_client is None:
        print("⚠️  Groq client unavailable. Skipping LLM call.")
        return "{}" if json_mode else "Groq unavailable."

    if _groq_call_count >= GROQ_LIMIT:
        print(f"⚠️  Groq limit reached ({GROQ_LIMIT}). Skipping.")
        return "{}" if json_mode else "Groq limit reached."

    _groq_call_count += 1
    print(f"🤖 Groq call #{_groq_call_count}/{GROQ_LIMIT} (model: {model})")

    kwargs = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": prompt}
        ],
        "model": model,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    try:
        completion = groq_client.chat.completions.create(**kwargs)
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Groq request failed: {e}")
        return "{}" if json_mode else "Groq unavailable."


# ── Node 1: Extract ───────────────────────────────────────
def extract_node(state: AgentState) -> AgentState:
    # Reset counters — fresh request
    reset_tavily_counter()
    reset_groq_counter()

    chat_history = state.get("chat_history", [])
    user_message = chat_history[-1].get("content", "") if chat_history else ""

    if not user_message:
        state["ask_user_flag"] = not (
            state.get("destination") and state.get("budget")
        )
        return state

    msg = user_message.lower()

    # ── Regex extraction — no Groq needed ────────────────
    # Budget — handles "30k", "30,000", "30000"
    budget_match = re.search(r'(\d+)\s*k\b', msg)
    if budget_match:
        state["budget"] = int(budget_match.group(1)) * 1000
    else:
        budget_match = re.search(r'(\d{4,6})', msg)
        if budget_match:
            state["budget"] = int(budget_match.group(1))

    # Nights
    nights_match = re.search(r'(\d+)\s*(?:night|nights|day|days)', msg)
    if nights_match:
        state["nights"] = int(nights_match.group(1))

    # Travel date/month
    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})\b", user_message)
    if date_match:
        state["travel_month"] = date_match.group(1)

    months = ["january","february","march","april","may","june",
              "july","august","september","october","november","december"]
    if not state.get("travel_month"):
        for month in months:
            if month in msg:
                state["travel_month"] = month.capitalize()
                break

    # People
    people_match = re.search(r'(\d+)\s*(?:people|person|persons|pax)', msg)
    if people_match:
        state["num_people"] = int(people_match.group(1))

    route_match = re.search(
        r"\bfrom\s+([A-Za-z .'\-]+?)\s+to\s+([A-Za-z .'\-]+?)(?=,|\b(?:budget|under|around|for|with|inr|rs|rupees|people|person|persons|pax|night|nights|day|days|in\s+\d)\b|$)",
        user_message,
        re.IGNORECASE,
    )
    if route_match:
        origin_candidate = _clean_place_candidate(route_match.group(1))
        destination_candidate = _clean_place_candidate(route_match.group(2))
        if origin_candidate:
            state["origin"] = origin_candidate
        if destination_candidate:
            state["destination"] = destination_candidate

    # Origin
    if not state.get("origin"):
        origin_match = re.search(r"\bfrom\s+([A-Za-z .'\-]+?)(?=\s+to\b|,|$)", user_message, re.IGNORECASE)
        if origin_match:
            candidate = _clean_place_candidate(origin_match.group(1))
            if candidate:
                state["origin"] = candidate

    # ── Simple regex destination extraction first ─────────
    if not state.get("destination"):
        destination_match = re.search(
            r"(?:trip\s+to|to|in)\s+([A-Za-z .'\-]+?)(?=,|\b(?:budget|under|around|for|with|inr|rs|rupees|people|person|persons|pax|night|nights|day|days)\b|$)",
            user_message,
            re.IGNORECASE,
        )
        if destination_match:
            candidate = _clean_place_candidate(destination_match.group(1))
            if candidate:
                state["destination"] = candidate

    # ── Groq fallback for destination if regex fails ───────
    if not state.get("destination"):
        try:
            prompt = f"""
Extract ONLY the destination city from: "{user_message}"
Return ONLY a JSON object: {{"destination": str or null}}
Example: {{"destination": "Manali"}}
"""
            response  = llm_call(prompt, json_mode=True)
            extracted = json.loads(response)
            if extracted.get("destination"):
                state["destination"] = extracted["destination"]
        except Exception as e:
            print(f"Extract error: {e}")

    # ── Defaults ──────────────────────────────────────────
    if not state.get("num_people"):   state["num_people"]   = 1
    if not state.get("nights"):       state["nights"]       = 3
    if not state.get("origin"):       state["origin"]       = "Delhi"
    if not state.get("travel_month"): state["travel_month"] = "current month"

    state["ask_user_flag"] = not (
        state.get("destination") and state.get("budget")
    )
    return state


def _resolve_nearby_transit_hubs(destination: str) -> Dict[str, Optional[str]]:
    prompt = f"""
Find the nearest transport hubs for {destination} in India.
Return ONLY JSON with these fields:
{{
  "train_station": str or null,
  "airport": str or null,
  "bus_terminal": str or null
}}
If destination has no direct train station, airport, or bus terminal, return the nearest hub names instead.
"""
    hubs = {"train_station": None, "airport": None, "bus_terminal": None}
    try:
        response = llm_call(prompt, json_mode=True)
        extracted = json.loads(response)
        for key in hubs:
            value = extracted.get(key)
            if isinstance(value, str) and value.strip():
                hubs[key] = value.strip()
    except Exception as e:
        print(f"Nearby hub resolution failed: {e}")

    # SerpAPI fallback for missing hub names
    if not hubs["train_station"]:
        hubs["train_station"] = get_nearest_hub_serpapi(destination, "railway station")
    if not hubs["airport"]:
        hubs["airport"] = get_nearest_hub_serpapi(destination, "airport")
    if not hubs["bus_terminal"]:
        hubs["bus_terminal"] = get_nearest_hub_serpapi(destination, "bus terminal")

    return hubs


# ── Node 2: Research ──────────────────────────────────────
def research_node(state: AgentState) -> AgentState:
    destination = state["destination"]
    month       = state.get("travel_month", "current month")
    nights      = state.get("nights", 3)
    num_people  = state.get("num_people", 2)
    lat         = state.get("destination_latitude")
    lng         = state.get("destination_longitude")

    # 1. Weather — Open-Meteo (free, no key, no Tavily)
    state["weather_data"] = get_weather_data(destination, latitude=lat, longitude=lng)

    # 2. Hotel price trends — SerpAPI Google Hotels (real prices!)
    serpapi_hotels = get_hotel_prices_serpapi(destination, month, nights, num_people)
    if serpapi_hotels:
        # Summarize real prices for budget node
        price_summary = "; ".join(
            f"{h['name']}: ₹{h['price']}/night" 
            for h in serpapi_hotels if h.get('price')
        )
        state["hotel_price_trend"] = f"Real Google Hotels prices: {price_summary}"
    else:
        # Fallback to Tavily if SerpAPI fails
        state["hotel_price_trend"] = get_hotel_prices_tavily(destination, month)

    # 3. Current situation — Tavily (cached 6hrs)
    state["current_situation"] = get_current_situation(destination)

    # 4. Season info — simple string, no LLM call
    state["season_info"] = f"{destination} in {month}"

    return state


# ── Node 3: Budget ────────────────────────────────────────
def budget_node(state: AgentState) -> AgentState:
    prompt = f"""
Decide a smart budget split for this trip.

Destination  : {state['destination']}
Month        : {state.get('travel_month', 'not specified')}
Total Budget : ₹{state['budget']} INR
People       : {state.get('num_people', 1)}
Nights       : {state.get('nights', 3)}
Origin       : {state.get('origin', 'Delhi')}

Data:
- Weather         : {state['weather_data']}
- Hotel trends    : {state['hotel_price_trend']}
- Current alerts  : {state['current_situation']}

Rules:
- Base hotel budget on ACTUAL nightly rates found in hotel trends
- Base transport on actual cost from origin
- Food and activities get remaining amount
- Never exceed ₹{state['budget']} total

Return ONLY JSON:
{{
  "hotel_budget"     : int,
  "transport_budget" : int,
  "food_budget"      : int,
  "activities_budget": int,
  "budget_reasoning" : str
}}
"""
    try:
        response   = llm_call(prompt, json_mode=True)
        allocation = json.loads(response)

        state["hotel_budget"]      = allocation.get("hotel_budget")
        state["transport_budget"]  = allocation.get("transport_budget")
        state["food_budget"]       = allocation.get("food_budget")
        state["activities_budget"] = allocation.get("activities_budget")
        state["budget_reasoning"]  = allocation.get("budget_reasoning")

    except Exception as e:
        print(f"Budget node error: {e}")
        quarter                    = state["budget"] // 4
        state["hotel_budget"]      = quarter
        state["transport_budget"]  = quarter
        state["food_budget"]       = quarter
        state["activities_budget"] = quarter
        state["budget_reasoning"]  = "Equal split fallback."

    # Fallback if Groq returned invalid/empty JSON
    if not state.get("hotel_budget"):
        quarter                    = state["budget"] // 4
        state["hotel_budget"]      = quarter
        state["transport_budget"]  = quarter
        state["food_budget"]       = quarter
        state["activities_budget"] = quarter
        state["budget_reasoning"]  = "Equal split fallback."

    return state


# ── Node 4: Search ────────────────────────────────────────
def search_node(state: AgentState) -> AgentState:
    nights           = state.get("nights", 3)
    num_people       = state.get("num_people", 2)
    hotel_budget     = state.get("hotel_budget", 0) or 0
    budget_per_night = hotel_budget // nights if hotel_budget else 0

    # ── Hotels — SerpAPI Google Hotels (structured, no LLM needed)
    serpapi_hotels = get_hotel_prices_serpapi(
        state["destination"],
        state.get("travel_month", ""),
        nights=nights,
        adults=num_people,
        max_price=hotel_budget,
        latitude=state.get("destination_latitude"),
        longitude=state.get("destination_longitude"),
    )
    state["hotels"] = serpapi_hotels if serpapi_hotels else []
    if not state["hotels"]:
        state.setdefault("warnings", []).append(
            "No hotels returned from SerpAPI. The key may be rate-limited/quota-limited, "
            "or Google Hotels returned no properties for the selected destination/date."
        )

    # ── Transport — structured mode-wise aggregation
    transport_data = get_transport_options(
        state.get("origin", "Delhi"),
        state["destination"],
        state.get("travel_month", ""),
        transport_budget=state.get("transport_budget"),
        latitude=state.get("destination_latitude"),
        longitude=state.get("destination_longitude"),
    )
    state["transport_options"] = transport_data.get("options", [])
    state["transport_by_mode"] = transport_data.get("by_mode", {})
    state["route_map_url"] = transport_data.get("route_map_url")

    # If no direct transport options, try alternative routes
    missing_modes = [mode for mode in ["train", "flight", "bus"]
                     if not state["transport_by_mode"].get(mode)]
    if missing_modes:
        hubs = _resolve_nearby_transit_hubs(state["destination"])
        alt_routes = []
        if "train" in missing_modes and hubs.get("train_station"):
            alt_routes.append({
                "from": state.get("origin", "Delhi"),
                "to": hubs["train_station"],
                "mode": "train",
                "description": (
                    f"Nearest rail hub for {state['destination']} is {hubs['train_station']}"
                ),
            })
        if "flight" in missing_modes and hubs.get("airport"):
            alt_routes.append({
                "from": state.get("origin", "Delhi"),
                "to": hubs["airport"],
                "mode": "flight",
                "description": (
                    f"Nearest airport for {state['destination']} is {hubs['airport']}"
                ),
            })
        if "bus" in missing_modes and hubs.get("bus_terminal"):
            alt_routes.append({
                "from": state.get("origin", "Delhi"),
                "to": hubs["bus_terminal"],
                "mode": "bus",
                "description": (
                    f"Nearest bus hub for {state['destination']} is {hubs['bus_terminal']}"
                ),
            })

        added_alt_modes = set()
        for alt in alt_routes:
            alt_transport_data = get_transport_options(
                alt["from"],
                alt["to"],
                state.get("travel_month", ""),
                state.get("transport_budget")
            )
            alt_options = [
                opt for opt in alt_transport_data.get("options", [])
                if (opt.get("type") or "").lower() == alt["mode"] and not opt.get("fallback")
            ]
            if not alt_options:
                continue

            for opt in alt_options:
                opt["description"] = alt["description"]
            state["transport_options"].extend(alt_options)
            added_alt_modes.add(alt["mode"])

            taxi_transfer = _build_taxi_transfer_option(
                alt["to"],
                state["destination"],
                f"Intermediate taxi after {alt['mode']} leg: {alt['to']} to {state['destination']}",
            )
            if taxi_transfer:
                state["transport_options"].append(taxi_transfer)
                state["transport_by_mode"].setdefault("taxi", []).append(taxi_transfer)

            alt_by_mode = alt_transport_data.get("by_mode", {})
            for mode, opts in alt_by_mode.items():
                if mode != alt["mode"]:
                    continue
                opts = [opt for opt in opts if not opt.get("fallback")]
                if not opts:
                    continue
                if mode not in state["transport_by_mode"]:
                    state["transport_by_mode"][mode] = []
                state["transport_by_mode"][mode].extend(opts)

        if added_alt_modes:
            state.setdefault("warnings", []).append(
                f"Direct {', '.join(sorted(added_alt_modes))} service to {state['destination']} was scarce."
                f" Added nearby hub options instead."
            )

    if not state["transport_options"]:
        alternatives = _get_alternative_routes(state.get("origin", "Delhi"), state["destination"])
        for alt in alternatives:
            alt_origin = alt.get("from")
            alt_dest = alt.get("to")
            if alt_origin and alt_dest:
                alt_transport_data = get_transport_options(
                    alt_origin,
                    alt_dest,
                    state.get("travel_month", ""),
                    state.get("transport_budget")
                )
                target_mode = (alt.get("mode") or "").lower()
                alt_options = [
                    opt for opt in alt_transport_data.get("options", [])
                    if not opt.get("fallback")
                    and (not target_mode or (opt.get("type") or "").lower() == target_mode)
                ]
                # Add description to each option
                for opt in alt_options:
                    opt["description"] = alt.get("description", f"Via {alt_origin} to {alt_dest}")
                state["transport_options"].extend(alt_options)
                taxi_transfer = _build_taxi_transfer_option(
                    alt_dest,
                    state["destination"],
                    f"Intermediate taxi after {target_mode or 'transport'} leg: {alt_dest} to {state['destination']}",
                )
                if taxi_transfer:
                    state["transport_options"].append(taxi_transfer)
                    state["transport_by_mode"].setdefault("taxi", []).append(taxi_transfer)
                # Update by_mode
                alt_by_mode = alt_transport_data.get("by_mode", {})
                for mode, opts in alt_by_mode.items():
                    if target_mode and mode != target_mode:
                        continue
                    opts = [opt for opt in opts if not opt.get("fallback")]
                    if not opts:
                        continue
                    if mode not in state["transport_by_mode"]:
                        state["transport_by_mode"][mode] = []
                    state["transport_by_mode"][mode].extend(opts)

    # Sort and group transport options
    from agent.tools import _transport_type_priority
    deduped_transport = []
    seen_transport = set()
    for item in state["transport_options"]:
        if item.get("fallback"):
            continue
        key = (
            (item.get("type") or "").lower(),
            str(item.get("name") or "").lower(),
            str(item.get("code") or "").upper(),
            str(item.get("route") or "").lower(),
        )
        if key in seen_transport:
            continue
        seen_transport.add(key)
        deduped_transport.append(item)
    state["transport_options"] = deduped_transport

    state["transport_options"].sort(
        key=lambda x: (
            _transport_type_priority(x.get("type", "")),
            x.get("fare") is None,
            x.get("fare") if x.get("fare") is not None else 10**9,
            x.get("duration", ""),
        )
    )

    # Re-group by mode
    by_mode: Dict[str, List[Dict[str, Any]]] = {"train": [], "flight": [], "bus": [], "taxi": []}
    for item in state["transport_options"]:
        mode = (item.get("type") or "").lower()
        if mode not in by_mode:
            by_mode[mode] = []
        by_mode[mode].append(item)
    state["transport_by_mode"] = by_mode

    # Redistribute saved hotel budget
    if state["hotels"]:
        valid = [h for h in state["hotels"]
                 if h.get("price") and h.get("price") > 0]
        if valid:
            valid.sort(key=lambda x: (-(x.get("rating") or 0),
                                       x.get("price") or 0))
            actual_total = valid[0]["price"] * nights
            if actual_total < state["hotel_budget"]:
                saved                       = state["hotel_budget"] - actual_total
                state["hotel_budget"]       = actual_total
                state["activities_budget"] += saved // 2
                state["food_budget"]        += saved // 2
                print(f"💰 Saved ₹{saved} → redistributed")

    # Replan check
    if state["hotels"] and state["transport_options"]:
        state["replan_flag"]   = False
        state["replan_reason"] = None
    else:
        state["replan_flag"]   = True
        state["replan_reason"] = "Could not find suitable hotels or transport."

    return state


# ── Node 5: Replan ────────────────────────────────────────
def replan_node(state: AgentState) -> AgentState:
    if not state.get("replan_flag"):
        return state

    if not state.get("warnings"):
        state["warnings"] = []

    # Ensure budgets are set
    if not state.get("hotel_budget"):
        quarter = state["budget"] // 4
        state["hotel_budget"] = quarter
        state["transport_budget"] = quarter
        state["food_budget"] = quarter
        state["activities_budget"] = quarter

    state["replan_count"] = state.get("replan_count", 0) + 1
    attempt               = state["replan_count"]

    if attempt == 1:
        reduction              = int(state["hotel_budget"] * 0.20)
        state["hotel_budget"] -= reduction
        state["food_budget"]  += reduction
        state["replan_reason"] = "Attempt 1: Trying cheaper hotels."

    elif attempt == 2:
        nights = state.get("nights", 3)
        if nights > 1:
            state["nights"]            = nights - 1
            freed                      = state["hotel_budget"] // (nights)
            state["hotel_budget"]     -= freed
            state["activities_budget"] += freed
        state["replan_reason"] = "Attempt 2: Reduced by 1 night."

    elif attempt >= 3:
        state["warnings"].append(
            f"₹{state['budget']} is tight for {state['destination']} "
            f"in {state.get('travel_month','this month')}. "
            f"Consider increasing budget or nearby destination."
        )
        state["replan_flag"]   = False
        state["replan_reason"] = "Max attempts reached."

    return state

def _get_alternative_routes(origin: str, destination: str) -> List[Dict[str, Any]]:
    prompt = f"""
Suggest alternative travel routes from {origin} to {destination} in India.
If direct services are scarce, prefer nearby hubs such as the nearest airport, railway station, or bus terminal for the destination.
Return ONLY a JSON array of objects with keys: "from", "to", "mode" (train/flight/bus), "description".

Example: [{{"from": "Delhi", "to": "Chandigarh", "mode": "train", "description": "Via Chandigarh"}}, {{"from": "Chandigarh", "to": "Manali", "mode": "bus", "description": "Local bus"}}]

Limit to 3-5 alternatives.
"""
    response = llm_call(prompt, json_mode=True)
    try:
        routes = json.loads(response)
        if isinstance(routes, list):
            return routes[:5]  # Limit to 5
    except Exception as e:
        print(f"Alternative routes error: {e}")
    return []


def _build_fallback_itinerary(state: AgentState) -> str:
    destination = state.get("destination", "your destination")
    origin = state.get("origin", "Delhi")
    nights = state.get("nights", 3)
    num_people = state.get("num_people", 1)
    weather = state.get("weather_data", {})
    sunset = weather.get("sunset_time", "evening")
    temp = weather.get("temp")
    temp_str = f"Currently around {temp}°C" if temp is not None else "Weather data unavailable"
    transport = state.get("transport_options", [])
    hotel = state.get("hotels", [])
    hotel_name = hotel[0].get("name") if hotel else "a comfortable hotel"

    itinerary = [
        f"### Trip to {destination}",
        f"- Origin: {origin}",
        f"- Nights: {nights}",
        f"- People: {num_people}",
        "",
        f"**Weather note:** {temp_str}. Be prepared for changing conditions and avoid late evening outdoor plans after {sunset}.",
        "",
        "### Day-by-day plan",
    ]

    itinerary.append(f"\n**Day 1:** Travel to {destination}, check in at {hotel_name}, relax and explore nearby markets or a local café.")
    if nights >= 2:
        itinerary.append(f"\n**Day 2:** Morning sightseeing around {destination}, choose a daytime activity like nature walks, local temples, or scenic viewpoints. Keep your afternoon flexible for rest.")
    if nights >= 3:
        itinerary.append(f"\n**Day 3:** Reserve this day for a short excursion, leisure time, and packing. Depart for {origin} in the evening or next morning.")

    itinerary.extend([
        "",
        "### What to carry",
        "- Warm clothing (jacket, gloves, caps, etc.)",
        "- Comfortable shoes",
        "- Sunscreen and sunglasses",
        "- Power bank and portable charger",
        "- Water bottle and snacks",
        "- Medications and first-aid kit",
    ])

    if transport:
        itinerary.append("\n### Transport options found:")
        for option in transport[:3]:
            itinerary.append(f"- {option.get('route')} ({option.get('type')}) — {option.get('duration')} | {option.get('code')}")

    return "\n".join(itinerary)


# ── Node 6: Itinerary ─────────────────────────────────────
def itinerary_node(state: AgentState) -> AgentState:
    if not state.get("warnings"):
        state["warnings"] = []

    hotels_summary = "\n".join(
        f"- {h.get('name', 'Unknown hotel')} at ₹{h.get('price', 'N/A')}/night ({h.get('location', '')})"
        for h in state.get("hotels", [])[:5]
    ) or "- No hotel pricing available yet."

    transport_summary = "\n".join(
        f"- {opt.get('route')} ({opt.get('type')}) — fare ₹{opt.get('fare') or 'N/A'}, {opt.get('duration')}"
        + (f" ({opt.get('description')})" if opt.get('description') else "")
        for opt in state.get("transport_options", [])[:5]
    ) or "- No transport options found."

    prompt = f"""
Compose a clean Markdown travel itinerary.
Use headings and bullet lists only; do not include JSON, code fences, or extra text markers.

Trip:
- Destination : {state['destination']}
- Month       : {state.get('travel_month', 'not specified')}
- Nights      : {state.get('nights', 3)}
- People      : {state.get('num_people', 1)}
- Origin      : {state.get('origin', 'Delhi')}

Weather       : {state['weather_data']}
Situation     : {state['current_situation']}

Budget:
- Hotel       : ₹{state['hotel_budget']}
- Transport   : ₹{state['transport_budget']}
- Food        : ₹{state['food_budget']}
- Activities  : ₹{state['activities_budget']}
- Reasoning   : {state['budget_reasoning']}

Hotels:
{hotels_summary}

Transport options:
{transport_summary}

Write a day-by-day itinerary in Markdown.
Include timings, meals, places to visit, safety notes, and packing advice.
Do not plan outdoor activities after sunset time.
"""
    try:
        result = llm_call(prompt)
        if result.strip() in ("Groq unavailable.", "Groq limit reached."):
            raise RuntimeError(result)

        state["itinerary"] = result
    except Exception as e:
        print(f"Itinerary error: {e}")
        raise RuntimeError(
            "Groq itinerary generation failed. Check GROQ_API in travel-agent/.env "
            "and restart the travel-agent API."
        ) from e

    state["budget_breakdown"] = {
        "Hotel"      : state["hotel_budget"],
        "Transport"  : state["transport_budget"],
        "Food"       : state["food_budget"],
        "Activities" : state["activities_budget"],
    }

    return state

