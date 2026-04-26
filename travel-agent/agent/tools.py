import os
import re
import time
import json
import math
import subprocess
import requests
from pathlib import Path
from typing import Dict, Any, List, Optional
from tavily import TavilyClient
from dotenv import load_dotenv

TRAVEL_AGENT_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = TRAVEL_AGENT_DIR.parent

# Load both supported env locations. The travel-agent .env wins when both exist.
load_dotenv(REPO_DIR / ".env")
load_dotenv(TRAVEL_AGENT_DIR / ".env", override=True)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY") or os.getenv("TAVILY_API") or os.getenv("TAILVY_API")
SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI") or os.getenv("SERPAPI_KEY")
if not TAVILY_API_KEY:
    print("⚠️  Missing Tavily API key. Set TAVILY_API_KEY, TAVILY_API, or TAILVY_API in your environment.")
    tavily = None
else:
    tavily = TavilyClient(api_key=TAVILY_API_KEY)

# ── API Counter ───────────────────────────────────────────
_tavily_call_count = 0
TAVILY_LIMIT = 10

def reset_tavily_counter():
    global _tavily_call_count
    _tavily_call_count = 0

# coordinates cache — geocode once, reuse forever
_coords_cache = {}

def get_coordinates(destination: str, latitude: float = None, longitude: float = None):
    if latitude is not None and longitude is not None:
        _coords_cache[destination.lower()] = (latitude, longitude)
        return latitude, longitude

    if destination.lower() in _coords_cache:
        return _coords_cache[destination.lower()]

    def call_geocoding(name: str):
        return requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": name,
                "count": 5,
                "language": "en",
                "format": "json"
            }
        ).json()

    data = call_geocoding(destination)
    
    # Fallback if specific string fails (e.g. "Manali Himachal Pradesh India" -> "Manali")
    if not data.get("results") and "," in destination:
        search_name = destination.split(',')[0].strip()
        data = call_geocoding(search_name)
    
    if not data.get("results"):
        return None, None

    results = data["results"]

    # If only one result — use it directly
    if len(results) == 1:
        r = results[0]
        _coords_cache[destination.lower()] = (r["latitude"], r["longitude"])
        return r["latitude"], r["longitude"]

    # Check if all results are same state — no ambiguity
    states = set(r.get("admin1", "") for r in results)
    if len(states) == 1:
        r = results[0]
        _coords_cache[destination.lower()] = (r["latitude"], r["longitude"])
        return r["latitude"], r["longitude"]

    # In API mode we cannot block on input. Prefer an India match, then first result.
    chosen = next((r for r in results if r.get("country_code") == "IN"), results[0])
    lat, lon = chosen["latitude"], chosen["longitude"]
    _coords_cache[destination.lower()] = (lat, lon)
    print(f"Using geocoding match: {chosen['name']}, {chosen.get('admin1')}")
    return lat, lon
def get_weather_data(destination: str, latitude: float = None, longitude: float = None) -> Dict[str, Any]:
    try:
        lat, lon = get_coordinates(destination, latitude, longitude)
        if not lat:
            return {"error": f"Could not find location: {destination}"}
        
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,snowfall,rain,windspeed_10m",
                "daily": "sunrise,sunset,temperature_2m_max,temperature_2m_min",
                "timezone": "Asia/Kolkata",
                "forecast_days": 1
            }
        )
        data = response.json()
        return {
            "temp":        data["current"]["temperature_2m"],
            "snowfall":    data["current"]["snowfall"] > 0,
            "rainfall":    data["current"]["rain"] > 0,
            "windspeed":   data["current"]["windspeed_10m"],
            "sunset_time": data["daily"]["sunset"][0].split("T")[1],
            "max_temp":    data["daily"]["temperature_2m_max"][0],
            "min_temp":    data["daily"]["temperature_2m_min"][0],
        }
    except Exception as e:
        return {"error": f"Weather fetch failed: {str(e)}"}



  


# ── Base Tavily Search ────────────────────────────────────
def tavily_search(query: str) -> str:
    """
    Base search function using Tavily.
    Returns clean text content for LLM to reason over.
    """
    global _tavily_call_count
    
    if tavily is None:
        return "Tavily API key missing; search unavailable."

    if _tavily_call_count >= TAVILY_LIMIT:
        print(f"⚠️  Tavily API limit reached ({TAVILY_LIMIT}). Skipping search for: {query}")
        return "Tavily API limit reached. Search results not available."
    
    try:
        _tavily_call_count += 1
        print(f"🔍 Tavily search #{_tavily_call_count}: {query}")
        response = tavily.search(
            query=query,
            search_depth="advanced"
        )
        return "\n\n".join([r['content'] for r in response['results']])
    
    except Exception as e:
        return f"Search error: {str(e)}"


# ── Tool 2: Hotel Prices (SerpAPI Google Hotels) ──────────
def get_hotel_prices_serpapi(
    destination: str,
    month: str,
    nights: int = 3,
    adults: int = 2,
    max_price: int = None,
    latitude: float = None,
    longitude: float = None,
) -> list:
    """
    Fetches real-time hotel prices from Google Hotels
    via SerpAPI. Returns structured list of hotel dicts.
    """
    from datetime import datetime, timedelta

    # Build check-in date: 15th of travel month (or today if current month)
    current_year = datetime.now().year
    months_map = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12
    }
    month_num = months_map.get(month.lower(), datetime.now().month)

    # If month already passed this year, use next year
    if month_num < datetime.now().month:
        current_year += 1

    check_in = datetime(current_year, month_num, 15)
    check_out = check_in + timedelta(days=nights)

    params = {
        "engine": "google_hotels",
        "q": f"hotels in {destination} India",
        "check_in_date": check_in.strftime("%Y-%m-%d"),
        "check_out_date": check_out.strftime("%Y-%m-%d"),
        "adults": adults,
        "currency": "INR",
        "gl": "in",
        "hl": "en",
        "api_key": SERPAPI_KEY,
    }
    if latitude and longitude:
        # Some SerpAPI engines use coordinates, Google Hotels often uses 'q' or 'location'
        # But for specific coordinates, we can try adding them to params if supported
        # or use them to refine the 'q' if needed. 
        # For now, let's keep 'q' but know that the user picked this specific one.
        pass

    if max_price:
        params["max_price"] = max_price

    try:
        print(f"🏨 SerpAPI Google Hotels: {destination} ({check_in.date()} → {check_out.date()})")
        response = requests.get(
            "https://serpapi.com/search",
            params=params,
            timeout=30,
        )
        if response.status_code == 429:
            print("SerpAPI hotel fetch rate-limited/quota-limited (HTTP 429).")
            return []
        if response.status_code >= 400:
            print(f"SerpAPI hotel fetch failed with HTTP {response.status_code}.")
            return []

        data = response.json()

        if "error" in data:
            print(f"⚠️  SerpAPI error: {data['error']}")
            return []

        hotels = []
        for prop in data.get("properties", [])[:5]:  # Top 5 hotels
            rate = prop.get("rate_per_night", {})
            hotels.append({
                "name": prop.get("name", "Unknown"),
                "price": rate.get("extracted_lowest"),
                "rating": prop.get("overall_rating"),
                "hotel_class": prop.get("hotel_class"),
                "location": prop.get("description", destination),
                "reviews": prop.get("reviews"),
                "amenities": prop.get("amenities", [])[:5],
            })

        print(f"✅ Found {len(hotels)} hotels from Google Hotels")
        return hotels

    except Exception as e:
        print(f"❌ SerpAPI hotel fetch failed: {e}")
        return []


# ── Tool 2b: Hotel Price Trends (Tavily fallback) ────────
def get_hotel_prices_tavily(destination: str, month: str) -> str:
    """Tavily fallback for hotel price trend research."""
    from datetime import datetime
    current_year = datetime.now().year
    query = (
        f"hotel room prices in {destination} India "
        f"in {month} {current_year} per night INR "
        f"site:makemytrip.com OR site:goibibo.com OR site:booking.com"
    )
    return tavily_search(query)


def _waypoint_from_maps_item(
    item: Dict[str, Any],
    order: int,
    query: str,
) -> Optional[Dict[str, Any]]:
    gps = item.get("gps_coordinates") or {}
    lat = gps.get("latitude")
    lng = gps.get("longitude")
    if lat is None or lng is None:
        return None

    return {
        "order": order,
        "query": query,
        "name": item.get("title") or item.get("name") or query,
        "lat": lat,
        "lng": lng,
        "address": item.get("address"),
    }


def get_top_place_pins_serpapi(destination: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Return tourist attraction map pins for the destination from SerpAPI Google Maps."""
    data = _serpapi_search({
        "engine": "google_maps",
        "q": f"top tourist attractions in {destination} India",
        "type": "search",
        "gl": "in",
        "hl": "en",
    })
    if not data:
        return []

    pins: List[Dict[str, Any]] = []
    seen = set()
    for item in data.get("local_results") or []:
        waypoint = _waypoint_from_maps_item(
            item,
            len(pins) + 1,
            item.get("title") or f"{destination} attraction",
        )
        if not waypoint:
            continue
        key = str(waypoint["name"]).lower()
        if key in seen:
            continue
        seen.add(key)
        pins.append(waypoint)
        if len(pins) >= limit:
            break
    return pins


def get_place_pins_serpapi(
    queries: List[str],
    destination: str,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    """Geocode named itinerary stops with SerpAPI Google Maps."""
    pins: List[Dict[str, Any]] = []
    seen = set()
    for query in queries:
        clean_query = str(query or "").strip()
        if not clean_query:
            continue
        data = _serpapi_search({
            "engine": "google_maps",
            "q": f"{clean_query} {destination} India",
            "type": "search",
            "gl": "in",
            "hl": "en",
        })
        if not data:
            continue
        candidates = []
        if data.get("place_results"):
            candidates.append(data["place_results"])
        candidates.extend(data.get("local_results") or [])
        for item in candidates:
            waypoint = _waypoint_from_maps_item(item, len(pins) + 1, clean_query)
            if not waypoint:
                continue
            key = str(waypoint["name"]).lower()
            if key in seen:
                continue
            seen.add(key)
            pins.append(waypoint)
            break
        if len(pins) >= limit:
            break
    return pins


def get_hotel_pins_serpapi(
    hotels: List[Dict[str, Any]],
    destination: str,
    limit: int = 6,
) -> List[Dict[str, Any]]:
    """Geocode hotel names with SerpAPI Google Maps."""
    queries = [str(h.get("name") or "").strip() for h in hotels if h.get("name")]
    return get_place_pins_serpapi(queries, destination, limit=limit)


def _serpapi_search(params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not SERPAPI_KEY:
        return None

    params = {**params, "api_key": SERPAPI_KEY}
    try:
        response = requests.get("https://serpapi.com/search", params=params, timeout=20)
        data = response.json()
        if data.get("error"):
            print(f"⚠️  SerpAPI error: {data['error']}")
            return None
        return data
    except Exception as e:
        print(f"⚠️  SerpAPI query failed: {e}")
        return None


def get_nearest_hub_serpapi(destination: str, hub_type: str) -> Optional[str]:
    """Use SerpAPI to infer the nearest airport, railway station, or bus terminal."""
    query = f"nearest {hub_type} to {destination} India"
    data = _serpapi_search({
        "engine": "google",
        "q": query,
        "gl": "in",
        "hl": "en",
    })
    if not data:
        return None

    results = data.get("organic_results") or []
    if not results:
        return None

    top = results[0]
    candidate = top.get("title") or top.get("snippet") or ""
    cleaned = _clean_nearest_hub_text(candidate)
    if cleaned:
        return cleaned
    return None


def _clean_nearest_hub_text(text: str) -> str:
    text = re.sub(r"\s*[|–—-].*$", "", text)
    text = re.sub(r"\s*\(.*?\)$", "", text)
    return text.strip()


def _resolve_nearby_transit_hubs(destination: str) -> Dict[str, Optional[str]]:
    """Resolve nearest transit hubs for the destination using SerpAPI."""
    hubs = {"train_station": None, "airport": None, "bus_terminal": None}

    hubs["train_station"] = get_nearest_hub_serpapi(destination, "railway station")
    hubs["airport"] = get_nearest_hub_serpapi(destination, "airport")
    hubs["bus_terminal"] = get_nearest_hub_serpapi(destination, "bus terminal")

    return hubs


def _estimate_route_fare(route: str, transport_type: str) -> int:
    route_lower = route.lower()
    if transport_type == "flight":
        base = 4200
        if "delhi" in route_lower or "mumbai" in route_lower:
            base += 1200
        if "chandigarh" in route_lower or "kullu" in route_lower or "manali" in route_lower:
            base += 400
    elif transport_type == "train":
        base = 1400
        if "delhi" in route_lower or "mumbai" in route_lower:
            base += 800
        if "chandigarh" in route_lower:
            base += 200
    elif transport_type == "bus":
        base = 1000
        if "delhi" in route_lower or "mumbai" in route_lower:
            base += 400
        if "chandigarh" in route_lower or "manali" in route_lower:
            base += 100
    else:
        base = 1800
    return base


def _ensure_transport_option_fare(option: Dict[str, Any]) -> Dict[str, Any]:
    if option.get("fare") is None:
        if (option.get("type") or "").lower() == "train":
            if not option.get("classes"):
                option["classes"] = [{
                    "classType": "Check availability",
                    "fare": "N/A",
                    "status": "Check railway portal",
                }]
            return option
        option["fare"] = _estimate_route_fare(option.get("route", ""), option.get("type", ""))

    classes = option.get("classes") or []
    if classes and not any(_extract_fare_to_int(c.get("fare", "")) for c in classes):
        est_fare = option["fare"]
        for c in classes:
            c["fare"] = f"₹{est_fare}"
            c["status"] = c.get("status") or "Estimated"
        option["classes"] = classes
    elif not classes:
        option["classes"] = [{
            "classType": "Economy",
            "fare": f"₹{option['fare']}",
            "status": "Estimated"
        }]

    return option


# ── Tool 3: Transport ─────────────────────────────────────
def _extract_fare_to_int(value: str) -> Optional[int]:
    if not value:
        return None
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


def _best_fare_from_classes(classes: List[Dict[str, str]]) -> Optional[int]:
    fares = [_extract_fare_to_int(c.get("fare", "")) for c in classes]
    valid = [f for f in fares if f is not None]
    return min(valid) if valid else None


def _transport_type_priority(transport_type: str) -> int:
    # Lower is better for display priority.
    priority = {
        "flight": 0,
        "train": 1,
        "bus": 2,
        "taxi": 3,
    }
    return priority.get((transport_type or "").lower(), 99)


def _build_transport_option(
    transport_type: str,
    name: str,
    route: str,
    code: str,
    duration: str,
    classes: List[Dict[str, str]],
) -> Dict[str, Any]:
    return {
        "type": transport_type,
        "name": name or route,
        "route": route,
        "code": code,
        "duration": duration,
        "classes": classes,
        "fare": _best_fare_from_classes(classes),
    }


_PLACE_ALIASES = {
    "mumabi": "Mumbai",
    "bombay": "Mumbai",
    "csmt": "Mumbai",
    "cstm": "Mumbai",
    "mumbai csmt": "Mumbai",
    "mumbai cstm": "Mumbai",
    "lokmanya tilak terminus": "Mumbai",
    "ltt": "Mumbai",
    "nagpur junction railway station": "Nagpur",
    "nagpur junction": "Nagpur",
    "ngp": "Nagpur",
    "new delhi": "Delhi",
    "ndls": "Delhi",
    "nzm": "Delhi",
    "bangalore": "Bengaluru",
    "kullu manali": "Kullu",
    "kullu manali airport": "Kullu",
}


_CITY_COORDINATES = {
    "Agra": (27.1767, 78.0081),
    "Ahmedabad": (23.0225, 72.5714),
    "Amritsar": (31.6340, 74.8723),
    "Aurangabad": (19.8762, 75.3433),
    "Bengaluru": (12.9716, 77.5946),
    "Bhopal": (23.2599, 77.4126),
    "Chandigarh": (30.7333, 76.7794),
    "Chennai": (13.0827, 80.2707),
    "Delhi": (28.6139, 77.2090),
    "Goa": (15.2993, 74.1240),
    "Guwahati": (26.1445, 91.7362),
    "Hyderabad": (17.3850, 78.4867),
    "Indore": (22.7196, 75.8577),
    "Jaipur": (26.9124, 75.7873),
    "Kochi": (9.9312, 76.2673),
    "Kolkata": (22.5726, 88.3639),
    "Kullu": (31.9579, 77.1095),
    "Manali": (32.2432, 77.1892),
    "Mumbai": (19.0760, 72.8777),
    "Nagpur": (21.1458, 79.0882),
    "Nashik": (19.9975, 73.7898),
    "Patna": (25.5941, 85.1376),
    "Pune": (18.5204, 73.8567),
    "Shimla": (31.1048, 77.1734),
    "Srinagar": (34.0837, 74.7973),
    "Surat": (21.1702, 72.8311),
    "Varanasi": (25.3176, 82.9739),
}


def _canonical_place_name(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" ,.")
    cleaned = re.sub(
        r"\b(?:railway station|train station|junction|jn|station)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
    if not cleaned:
        return ""
    return _PLACE_ALIASES.get(cleaned.lower(), cleaned.title())


def _real_options(options: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [option for option in options if not option.get("fallback")]


def _dedupe_transport_options(options: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: List[Dict[str, Any]] = []
    seen = set()
    for option in options:
        key = (
            (option.get("type") or "").lower(),
            str(option.get("name") or "").lower(),
            str(option.get("code") or "").upper(),
            str(option.get("route") or "").lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(option)
    return deduped


def _coords_for_place(value: str) -> Optional[tuple]:
    canonical = _canonical_place_name(value)
    if canonical in _CITY_COORDINATES:
        return _CITY_COORDINATES[canonical]

    lowered = str(value or "").lower()
    for city, coords in _CITY_COORDINATES.items():
        if city.lower() in lowered:
            return coords
    return None


def _haversine_km(a: tuple, b: tuple) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    inner = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(inner))


def _duration_from_km(distance_km: int) -> str:
    hours = max(1, round(distance_km / 45))
    if hours < 24:
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    return f"{hours // 24}d {hours % 24}h"


def _build_taxi_transfer_option(
    origin: str,
    destination: str,
    description: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    from_place = _canonical_place_name(origin) or str(origin or "").strip()
    to_place = _canonical_place_name(destination) or str(destination or "").strip()
    if not from_place or not to_place or from_place.lower() == to_place.lower():
        return None

    from_coords = _coords_for_place(origin)
    to_coords = _coords_for_place(destination)
    if not from_coords or not to_coords:
        return None

    road_km = max(5, round(_haversine_km(from_coords, to_coords) * 1.25))
    sedan_fare = max(500, int(round((road_km * 18) / 50) * 50))
    suv_fare = max(700, int(round((road_km * 26) / 50) * 50))
    return _build_transport_option(
        "taxi",
        f"Taxi transfer {from_place} to {to_place}",
        f"{from_place} to {to_place}",
        "TAXI-EST",
        _duration_from_km(road_km),
        [
            {"classType": "Sedan", "fare": f"₹{sedan_fare}", "status": f"Estimated {road_km} km road transfer"},
            {"classType": "SUV", "fare": f"₹{suv_fare}", "status": f"Estimated {road_km} km road transfer"},
        ],
    ) | {
        "description": description or "Intermediate road transfer estimate",
        "estimated": True,
    }


def _parse_transport_options_from_text(raw_text: str) -> List[Dict[str, Any]]:
    """
    Parse transport options from Tavily/raw scraper text.
    Supports lines like:
    - Mumbai to Chandigarh [AI103] Fare: ₹6000 Duration: 2h 30m
    - Delhi to Manali [HRTC101] Sleeper ₹1500
    """
    if not raw_text:
        return []

    options: List[Dict[str, Any]] = []
    normalized = raw_text.replace("\r", "\n")
    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]

    for line in lines:
        lower = line.lower()
        if not any(k in lower for k in ["train", "flight", "bus", "taxi", " to "]):
            continue

        route_match = re.search(r"([A-Za-z\s]+to[A-Za-z\s]+)", line, re.IGNORECASE)
        code_match = re.search(r"\[([A-Za-z0-9\-]+)\]", line)
        fare_match = re.search(r"(₹\s?[\d,]+|\bINR\s?[\d,]+)", line, re.IGNORECASE)
        duration_match = re.search(r"(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes).*)", line, re.IGNORECASE)

        route = route_match.group(1).strip() if route_match else ""
        code = code_match.group(1).strip() if code_match else ""
        fare_text = fare_match.group(1).strip() if fare_match else "N/A"
        duration = duration_match.group(1).strip() if duration_match else "N/A"

        transport_type = "train"
        if "flight" in lower or (code and code.upper().startswith(("AI", "6E", "UK", "SG", "G8"))):
            transport_type = "flight"
        elif "bus" in lower or (code and code.upper().startswith(("HRTC", "VOLVO", "BUS"))):
            transport_type = "bus"
        elif "taxi" in lower or (code and code.upper().startswith("TAXI")):
            transport_type = "taxi"

        options.append(
            _build_transport_option(
                transport_type=transport_type,
                name=route or "Unknown route",
                route=route or "Unknown route",
                code=code or "N/A",
                duration=duration,
                classes=[{"classType": "Economy", "fare": fare_text, "status": "Available"}],
            )
        )

    return options


def _fallback_transport_options(origin: str, destination: str) -> List[Dict[str, Any]]:
    # Fallback sample set when scraper/Tavily data is sparse.
    return [
        _build_transport_option(
            "train",
            f"{origin} to Chandigarh",
            f"{origin} to Chandigarh",
            "12217",
            "24 hours",
            [
                {"classType": "Economy", "fare": "N/A", "status": "N/A"},
                {"classType": "2A", "fare": "₹2500", "status": "Available"},
                {"classType": "3A", "fare": "₹1800", "status": "Available"},
            ],
        ),
        _build_transport_option(
            "flight",
            f"{origin} to Delhi",
            f"{origin} to Delhi",
            "AI101",
            "2 hours",
            [{"classType": "Economy", "fare": "₹5000", "status": "Available"}],
        ),
        _build_transport_option(
            "bus",
            "Delhi to Manali",
            "Delhi to Manali",
            "HRTC101",
            "12 hours",
            [
                {"classType": "Semi-Sleeper", "fare": "₹1000", "status": "Available"},
                {"classType": "Sleeper", "fare": "₹1500", "status": "Available"},
            ],
        ),
        _build_transport_option(
            "taxi",
            "Chandigarh to Manali",
            "Chandigarh to Manali",
            "Taxi101",
            "8 hours",
            [
                {"classType": "Sedan", "fare": "₹3000", "status": "Available"},
                {"classType": "SUV", "fare": "₹4000", "status": "Available"},
            ],
        ),
    ]


def _repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _extract_json_from_output(output: str) -> Optional[Dict[str, Any]]:
    if not output:
        return None
    start = output.find("{")
    end = output.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    payload = output[start : end + 1]
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def _scraper_display_name(script_name: str) -> str:
    names = {
        "trainScraper.js": "train",
        "flightScraper.js": "flight",
        "busScraper.js": "bus",
    }
    return names.get(script_name, script_name)


def _scraper_error_message(result: subprocess.CompletedProcess) -> str:
    message = (result.stderr or result.stdout or "").strip()
    if not message:
        return f"exited with code {result.returncode}"
    return message.splitlines()[0][:300]


def _transport_scraper_date(month: str) -> str:
    """Return a concrete future date for transport scrapers in YYYY-MM-DD."""
    from datetime import datetime, timedelta

    value = str(month or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    if re.fullmatch(r"\d{2}-\d{2}-\d{4}", value):
        dd, mm, yyyy = value.split("-")
        return f"{yyyy}-{mm}-{dd}"

    today = datetime.now()
    month_lookup = {
        "january": 1,
        "february": 2,
        "march": 3,
        "april": 4,
        "may": 5,
        "june": 6,
        "july": 7,
        "august": 8,
        "september": 9,
        "october": 10,
        "november": 11,
        "december": 12,
    }

    lowered = value.lower()
    month_num = next((num for name, num in month_lookup.items() if name in lowered), None)
    if month_num is None:
        return (today + timedelta(days=1)).strftime("%Y-%m-%d")

    year = today.year
    candidate = datetime(year, month_num, 15)
    if candidate.date() <= today.date():
        candidate = datetime(year + 1, month_num, 15)
    return candidate.strftime("%Y-%m-%d")


def _log_scraper_result(script_name: str, raw: Dict[str, Any]) -> None:
    mode = _scraper_display_name(script_name)
    if mode == "train":
        count = len(raw.get("trains", []) or [])
    elif mode == "bus" and "buses" in raw:
        count = len(raw.get("buses", []) or [])
    else:
        count = len(raw.get("options", []) or [])

    fallback_note = " (fallback/no direct results)" if raw.get("fallback") else ""
    source = raw.get("source", "local scraper")
    print(f"[OK] {mode.title()} scraper: {count} option(s) from {source}{fallback_note}")

    preview_options = raw.get("options") or raw.get("buses") or []
    if mode in {"bus", "flight"} and preview_options:
        for option in preview_options[:3]:
            fare = option.get("fare") or option.get("price")
            fare_text = f"INR {fare}" if fare is not None else "N/A"
            time_text = " -> ".join(
                part for part in [
                    option.get("departure") or option.get("departureTime"),
                    option.get("arrival") or option.get("arrivalTime"),
                ] if part
            ) or option.get("duration", "N/A")
            print(
                f"   - {option.get('name') or option.get('busName') or 'Unknown'} "
                f"[{option.get('code', 'N/A')}] {fare_text}, {time_text}"
            )


def _run_node_scraper(script_name: str, origin: str, destination: str, date_value: str = "15-12-2026") -> Optional[Dict[str, Any]]:
    script_path = os.path.join(_repo_root(), "scraper", script_name)
    mode = _scraper_display_name(script_name)
    if not os.path.exists(script_path):
        print(f"[WARN] {mode.title()} scraper missing: {script_path}")
        return None

    print(f"[INFO] Running {mode} scraper: {origin} -> {destination}")

    # Script prompts for: origin, destination, date
    stdin_payload = f"{origin}\n{destination}\n{date_value}\n"
    command = ["node", script_path]
    input_payload = stdin_payload
    if script_name == "busScraper.js":
        command = ["node", script_path, origin, destination, date_value]
        input_payload = None

    try:
        result = subprocess.run(
            command,
            input=input_payload,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            check=False,
        )
    except Exception as e:
        print(f"[WARN] {mode.title()} scraper failed to run: {e}")
        return None

    if result.returncode != 0:
        print(f"[WARN] {mode.title()} scraper failed: {_scraper_error_message(result)}")
        return None

    parsed = _extract_json_from_output(result.stdout)
    if not parsed:
        print(f"[WARN] {mode.title()} scraper returned no parseable JSON.")
        return None

    _log_scraper_result(script_name, parsed)
    return parsed


def _normalize_train_scraper_output(raw: Optional[Dict[str, Any]], origin: str, destination: str) -> List[Dict[str, Any]]:
    if not raw:
        return []
    trains = raw.get("trains", [])
    normalized: List[Dict[str, Any]] = []
    for t in trains:
        classes = t.get("availability", []) or []
        duration = t.get("dur") or "N/A"
        transport = _build_transport_option(
            "train",
            t.get("trainName", f"{origin} to {destination}"),
            f"{origin} to {destination}",
            t.get("trainNumber", "N/A"),
            duration,
            classes,
        )
        if t.get("fromStation") and t.get("toStation"):
            transport["description"] = f"Stations: {t.get('fromStation')} to {t.get('toStation')}"
        if t.get("runningDays"):
            existing_description = transport.get("description")
            running_days = f"Runs: {t.get('runningDays')}"
            transport["description"] = (
                f"{existing_description} | {running_days}"
                if existing_description
                else running_days
            )
        if t.get("dep"):
            transport["departure"] = t.get("dep")
        if t.get("arr"):
            transport["arrival"] = t.get("arr")
        normalized.append(transport)
    return normalized


def _normalize_mode_scraper_output(raw: Optional[Dict[str, Any]], mode: str) -> List[Dict[str, Any]]:
    if not raw:
        return []
    if mode == "bus" and "buses" in raw:
        return _normalize_paytm_bus_output(raw)

    options = raw.get("options", [])
    top_level_fallback = bool(raw.get("fallback"))
    normalized: List[Dict[str, Any]] = []
    for opt in options:
        transport = _build_transport_option(
            mode,
            opt.get("name") or opt.get("route", "Unknown route"),
            opt.get("route", "Unknown route"),
            opt.get("code", "N/A"),
            opt.get("duration", "N/A"),
            opt.get("classes", []) or [],
        )
        if top_level_fallback or opt.get("fallback"):
            transport["fallback"] = True
        if opt.get("description"):
            transport["description"] = opt.get("description")
        if opt.get("departure"):
            transport["departure"] = opt.get("departure")
        if opt.get("arrival"):
            transport["arrival"] = opt.get("arrival")
        if opt.get("estimated"):
            transport["estimated"] = True
        normalized.append(transport)
    return normalized


def _normalize_time_12h(value: str) -> str:
    if not value:
        return "N/A"
    parsed = re.match(r"^\s*(\d{1,2}):(\d{2})\s*([AP]M)\s*$", str(value), re.IGNORECASE)
    if not parsed:
        return str(value).strip() or "N/A"
    hour = int(parsed.group(1)) % 12
    if parsed.group(3).upper() == "PM":
        hour += 12
    return f"{hour:02d}:{parsed.group(2)}"


def _normalize_paytm_bus_output(raw: Dict[str, Any]) -> List[Dict[str, Any]]:
    buses = raw.get("buses", []) or []
    search_url = raw.get("searchUrl", "")
    normalized: List[Dict[str, Any]] = []

    route = "Unknown route"
    if search_url:
        match = re.search(r"/bus/search/([^/]+)/([^/]+)/([^/]+)/", search_url)
        if match:
            from urllib.parse import unquote

            route = f"{unquote(match.group(1))} to {unquote(match.group(2))}"

    for bus in buses:
        fare = _extract_fare_to_int(bus.get("price", ""))
        name = bus.get("busName") or "Paytm bus"
        departure = _normalize_time_12h(bus.get("departureTime", ""))
        arrival = _normalize_time_12h(bus.get("arrivalTime", ""))
        transport = _build_transport_option(
            "bus",
            name,
            route,
            None,
            "N/A",
            [{
                "classType": "Bus ticket",
                "fare": bus.get("price", "N/A"),
                "status": "Available on Paytm",
            }],
        )
        transport["fare"] = fare
        transport["departure"] = departure
        transport["arrival"] = arrival
        transport["description"] = "Source: Paytm"
        if bus.get("arrivalDate"):
            transport["description"] += f" | Arrival date: {bus.get('arrivalDate')}"
        if search_url:
            transport["description"] += f" | {search_url}"
        normalized.append(transport)

    return normalized


def get_route_map_serpapi(origin: str, destination: str) -> Optional[str]:
    """Get a static map image or link for the route using SerpAPI Google Maps engine."""
    params = {
        "engine": "google_maps",
        "q": f"route from {origin} to {destination}",
        "type": "search",
        "api_key": SERPAPI_KEY
    }
    try:
        data = _serpapi_search(params)
        if data and "static_map" in data:
            return data["static_map"].get("link")
        return None
    except Exception:
        return None

def get_transport_options(
    origin: str,
    destination: str,
    month: str,
    transport_budget: int = None,
    latitude: float = None,
    longitude: float = None
) -> Dict[str, Any]:
    """
    Collect and sort transport modes (train/flight/bus/taxi).
    Priority: local JS scrapers -> Tavily parse -> fallback samples.
    """
    parsed: List[Dict[str, Any]] = []
    origin = _canonical_place_name(origin) or origin
    destination = _canonical_place_name(destination) or destination

    # Try SerpAPI for a route overview/map if possible
    route_map = get_route_map_serpapi(origin, destination)

    # 1) Local scrapers (authoritative for this project)
    travel_date = _transport_scraper_date(month)
    train_raw = _run_node_scraper("trainScraper.js", origin, destination, travel_date)
    flight_raw = _run_node_scraper("flightScraper.js", origin, destination, travel_date)
    bus_raw = _run_node_scraper("busScraper.js", origin, destination, travel_date)

    hubs = _resolve_nearby_transit_hubs(destination)

    parsed.extend(_normalize_train_scraper_output(train_raw, origin, destination))
    parsed.extend(_real_options(_normalize_mode_scraper_output(flight_raw, "flight")))
    parsed.extend(_real_options(_normalize_mode_scraper_output(bus_raw, "bus")))

    # If direct mode results are missing, attempt hub-based alternatives
    if not any(item["type"] == "train" and not item.get("fallback") for item in parsed) and hubs.get("train_station"):
        train_hub = _canonical_place_name(hubs["train_station"]) or hubs["train_station"]
        train_hub_raw = _run_node_scraper("trainScraper.js", origin, train_hub, travel_date)
        hub_options = _normalize_train_scraper_output(train_hub_raw, origin, train_hub)
        for opt in hub_options:
            opt["description"] = f"Nearest rail hub for {destination}: {train_hub}"
        parsed.extend(hub_options)
        if hub_options:
            taxi_transfer = _build_taxi_transfer_option(
                train_hub,
                destination,
                f"Intermediate taxi from rail hub {train_hub} to {destination}",
            )
            if taxi_transfer:
                parsed.append(taxi_transfer)

    if not any(item["type"] == "flight" and not item.get("fallback") for item in parsed) and hubs.get("airport"):
        airport_hub = _canonical_place_name(hubs["airport"]) or hubs["airport"]
        flight_hub_raw = _run_node_scraper("flightScraper.js", origin, airport_hub, travel_date)
        hub_options = _real_options(_normalize_mode_scraper_output(flight_hub_raw, "flight"))
        for opt in hub_options:
            opt["description"] = f"Nearest airport for {destination}: {airport_hub}"
        parsed.extend(hub_options)
        if hub_options:
            taxi_transfer = _build_taxi_transfer_option(
                airport_hub,
                destination,
                f"Intermediate taxi from airport {airport_hub} to {destination}",
            )
            if taxi_transfer:
                parsed.append(taxi_transfer)

    if not any(item["type"] == "bus" and not item.get("fallback") for item in parsed) and hubs.get("bus_terminal"):
        bus_hub = _canonical_place_name(hubs["bus_terminal"]) or hubs["bus_terminal"]
        bus_hub_raw = _run_node_scraper("busScraper.js", origin, bus_hub, travel_date)
        hub_options = _real_options(_normalize_mode_scraper_output(bus_hub_raw, "bus"))
        for opt in hub_options:
            opt["description"] = f"Nearest bus terminal for {destination}: {bus_hub}"
        parsed.extend(hub_options)
        if hub_options:
            taxi_transfer = _build_taxi_transfer_option(
                bus_hub,
                destination,
                f"Intermediate taxi from bus hub {bus_hub} to {destination}",
            )
            if taxi_transfer:
                parsed.append(taxi_transfer)

    parsed = _dedupe_transport_options(_real_options(parsed))

    # Fill any missing fare values with conservative estimates
    parsed = [_ensure_transport_option_fare(option) for option in parsed]

    # No Tavily or hardcoded fallback transport options.
    # Use only results returned by the local JS scrapers.
    query = ""

    parsed.sort(
        key=lambda x: (
            _transport_type_priority(x.get("type", "")),
            x.get("fare") is None,
            x.get("fare") if x.get("fare") is not None else 10**9,
            x.get("duration", ""),
        )
    )

    by_mode: Dict[str, List[Dict[str, Any]]] = {"train": [], "flight": [], "bus": [], "taxi": []}
    for item in parsed:
        mode = (item.get("type") or "").lower()
        if mode not in by_mode:
            by_mode[mode] = []
        by_mode[mode].append(item)

    return {
        "options": parsed,
        "by_mode": by_mode,
        "source": "local-scraper",
        "query": query,
        "hubs": hubs,
        "route_map_url": route_map,
    }


# ── Tool 4: Current Situation (cached 6 hours) ───────────
_situation_cache: Dict[str, Any] = {
    "data": {},
    "timestamp": {}
}

def get_current_situation(destination: str) -> str:
    """
    Searches current travel alerts, road conditions,
    and news for destination. 
    Cached for 6 hours to save Tavily quota —
    same result shared across all users in that window.
    """
    current_time = time.time()
    
    # Return cached if less than 6 hours old
    if (
        destination in _situation_cache["data"] and
        current_time - _situation_cache["timestamp"].get(destination, 0) < 21600
    ):
        return _situation_cache["data"][destination]
    
    # Fetch fresh from Tavily
    query = (
        f"current travel situation road conditions "
        f"alerts warnings {destination} India today 2025"
    )
    result = tavily_search(query)
    
    # Cache result
    _situation_cache["data"][destination] = result
    _situation_cache["timestamp"][destination] = current_time
    
    return result
