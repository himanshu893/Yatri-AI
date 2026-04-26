import os
import re
import time
import json
import subprocess
import requests
from typing import Dict, Any, List, Optional
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv(override=True)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY") or os.getenv("TAVILY_API") or os.getenv("TAILVY_API")
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

def get_coordinates(destination: str):
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

    # Multiple different states found — ask user!
    print(f"\n🤔 Multiple '{destination}' found:")
    for i, r in enumerate(results, 1):
        print(f"  {i}. {r['name']}, {r.get('admin1', '?')}, {r.get('country', '')}")

    while True:
        try:
            choice = int(input(f"\nWhich {destination} did you mean? (1-{len(results)}): "))
            if 1 <= choice <= len(results):
                chosen = results[choice - 1]
                lat, lon = chosen["latitude"], chosen["longitude"]
                # Cache with state name too for future
                _coords_cache[destination.lower()] = (lat, lon)
                print(f"✅ Got it! Using {chosen['name']}, {chosen.get('admin1')}")
                return lat, lon
        except ValueError:
            pass
        print("Please enter a valid number.")
def get_weather_data(destination: str) -> Dict[str, Any]:
    try:
        lat, lon = get_coordinates(destination)
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
        "api_key": os.getenv("SERPAPI_KEY"),
    }
    if max_price:
        params["max_price"] = max_price

    try:
        print(f"🏨 SerpAPI Google Hotels: {destination} ({check_in.date()} → {check_out.date()})")
        response = requests.get(
            "https://serpapi.com/search",
            params=params,
        )
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


def _run_node_scraper(script_name: str, origin: str, destination: str, date_value: str = "15-12-2026") -> Optional[Dict[str, Any]]:
    script_path = os.path.join(_repo_root(), "scraper", script_name)
    if not os.path.exists(script_path):
        return None

    # Script prompts for: origin, destination, date
    stdin_payload = f"{origin}\n{destination}\n{date_value}\n"
    try:
        result = subprocess.run(
            ["node", script_path],
            input=stdin_payload,
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
    except Exception:
        return None

    if result.returncode != 0:
        return None

    return _extract_json_from_output(result.stdout)


def _normalize_train_scraper_output(raw: Optional[Dict[str, Any]], origin: str, destination: str) -> List[Dict[str, Any]]:
    if not raw:
        return []
    trains = raw.get("trains", [])
    normalized: List[Dict[str, Any]] = []
    for t in trains:
        classes = t.get("availability", []) or []
        duration = t.get("dur") or "N/A"
        normalized.append(
            _build_transport_option(
                "train",
                t.get("trainName", f"{origin} to {destination}"),
                f"{origin} to {destination}",
                t.get("trainNumber", "N/A"),
                duration,
                classes,
            )
        )
    return normalized


def _normalize_mode_scraper_output(raw: Optional[Dict[str, Any]], mode: str) -> List[Dict[str, Any]]:
    if not raw:
        return []
    options = raw.get("options", [])
    normalized: List[Dict[str, Any]] = []
    for opt in options:
        normalized.append(
            _build_transport_option(
                mode,
                opt.get("name") or opt.get("route", "Unknown route"),
                opt.get("route", "Unknown route"),
                opt.get("code", "N/A"),
                opt.get("duration", "N/A"),
                opt.get("classes", []) or [],
            )
        )
    return normalized


def get_transport_options(
    origin: str,
    destination: str,
    month: str,
    transport_budget: int = None
) -> Dict[str, Any]:
    """
    Collect and sort transport modes (train/flight/bus/taxi).
    Priority: local JS scrapers -> Tavily parse -> fallback samples.
    """
    parsed: List[Dict[str, Any]] = []

    # 1) Local scrapers (authoritative for this project)
    train_raw = _run_node_scraper("trainScraper.js", origin, destination)
    flight_raw = _run_node_scraper("flightScraper.js", origin, destination)
    bus_raw = _run_node_scraper("busScraper.js", origin, destination)

    parsed.extend(_normalize_train_scraper_output(train_raw, origin, destination))
    parsed.extend(_normalize_mode_scraper_output(flight_raw, "flight"))
    parsed.extend(_normalize_mode_scraper_output(bus_raw, "bus"))

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
        "source": "local-scraper+tavily+fallback",
        "query": query,
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