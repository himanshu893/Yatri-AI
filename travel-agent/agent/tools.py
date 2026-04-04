import os
import time
import requests
from typing import Dict, Any, List, Optional, Tuple
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv(override=True)

tavily = TavilyClient(api_key=os.getenv("TAILVY_API"))

# ── API Counter ───────────────────────────────────────────
_tavily_call_count = 0
TAVILY_LIMIT = 10

def reset_tavily_counter():
    global _tavily_call_count
    _tavily_call_count = 0

# coordinates cache — geocode once, reuse forever
_coords_cache = {}

def get_coordinates(destination: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Resolve destination to lat/lon via Open-Meteo geocoding.
    Never reads from stdin — ambiguous names use the highest-population match.
    For explicit picks, the API should send destination_lat/lng from /destinations/search.
    """
    if destination.lower() in _coords_cache:
        return _coords_cache[destination.lower()]

    def call_geocoding(name: str, count: int = 10):
        return requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": name,
                "count": count,
                "language": "en",
                "format": "json",
            },
            timeout=20,
        ).json()

    data = call_geocoding(destination)

    if not data.get("results") and "," in destination:
        search_name = destination.split(",")[0].strip()
        data = call_geocoding(search_name)

    if not data.get("results"):
        return None, None

    results = list(data["results"])
    # Prefer larger settlements when the query is ambiguous (no terminal prompt).
    results.sort(key=lambda r: -(r.get("population") or 0))

    r = results[0]
    lat, lon = r["latitude"], r["longitude"]
    _coords_cache[destination.lower()] = (lat, lon)
    if len(results) > 1:
        print(
            f"📍 Using '{r['name']}, {r.get('admin1', '?')}' "
            f"(largest population among {len(results)} matches). "
            "Use the web UI to pick a different place."
        )
    return lat, lon


def _open_meteo_geocode_raw(name: str, count: int = 10) -> List[Dict[str, Any]]:
    data = requests.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={
            "name": name.strip(),
            "count": count,
            "language": "en",
            "format": "json",
        },
        timeout=20,
    ).json()
    return list(data.get("results") or [])


def search_serpapi_maps_local_results(
    query: str,
    limit: int = 10,
    gl: str = "in",
    hl: str = "en",
) -> List[Dict[str, Any]]:
    """Top local_results from SerpAPI Google Maps (POIs / places)."""
    api_key = os.getenv("SERPAPI_KEY")
    if not api_key:
        return []

    q = f"{query.strip()}, India"
    params = {
        "engine": "google_maps",
        "type": "search",
        "q": q,
        "gl": gl,
        "hl": hl,
        "api_key": api_key,
    }
    try:
        response = requests.get("https://serpapi.com/search", params=params, timeout=30)
        data = response.json()
        if data.get("error"):
            print(f"⚠️  SerpAPI Maps search: {data['error']}")
            return []
        rows = data.get("local_results") or []
        if not rows and data.get("place_results"):
            rows = [data["place_results"]]
        return rows[:limit]
    except Exception as e:
        print(f"❌ SerpAPI Maps search failed: {e}")
        return []


def search_destination_candidates(
    raw_query: str,
    per_source: int = 10,
    max_total: int = 16,
) -> List[Dict[str, Any]]:
    """
    Merged place suggestions for UI pickers: Open-Meteo (admin areas + cities)
    plus SerpAPI Google Maps (tourist / POI style). Deduped by rounded coordinates.
    """
    q = raw_query.strip()
    if not q:
        return []

    seen: set = set()
    out: List[Dict[str, Any]] = []

    def add_candidate(
        cid: str,
        name: str,
        label: str,
        lat: float,
        lng: float,
        source: str,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        key = (round(lat, 3), round(lng, 3))
        if key in seen:
            return
        seen.add(key)
        row: Dict[str, Any] = {
            "id": cid,
            "name": name,
            "label": label,
            "lat": lat,
            "lng": lng,
            "source": source,
        }
        if extra:
            row.update(extra)
        out.append(row)

    # 1) Open-Meteo — up to `per_source` geographic matches
    for i, r in enumerate(_open_meteo_geocode_raw(q, count=per_source)):
        lat, lng = r["latitude"], r["longitude"]
        admin1 = r.get("admin1") or ""
        country = r.get("country") or ""
        nm = r.get("name") or q
        label = ", ".join(x for x in (nm, admin1, country) if x)
        add_candidate(
            f"om:{r.get('id', i)}",
            nm,
            label,
            float(lat),
            float(lng),
            "open_meteo",
            {
                "region": admin1,
                "country": country,
                "population": r.get("population"),
            },
        )
        if len(out) >= max_total:
            return out

    # 2) SerpAPI Google Maps — up to `per_source` place-style results
    for i, row in enumerate(search_serpapi_maps_local_results(q, limit=per_source)):
        gps = row.get("gps_coordinates") or {}
        lat, lng = gps.get("latitude"), gps.get("longitude")
        if lat is None or lng is None:
            continue
        title = (row.get("title") or q).strip()
        addr = (row.get("address") or "").strip()
        label = f"{title}" + (f", {addr}" if addr else "")
        add_candidate(
            f"gm:{row.get('place_id') or i}",
            title,
            label,
            float(lat),
            float(lng),
            "google_maps",
            {"address": addr or None, "rating": row.get("rating"), "reviews": row.get("reviews")},
        )
        if len(out) >= max_total:
            break

    return out


def geocode_place_google_maps_serpapi(
    place_query: str,
    destination_context: str = "",
    gl: str = "in",
    hl: str = "en",
) -> Optional[Dict[str, Any]]:
    """
    Geocode a place name for map pins using SerpAPI Google Maps search.
    Returns dict with name, lat, lng, address (if present) or None.
    """
    api_key = os.getenv("SERPAPI_KEY")
    if not api_key:
        return None

    q = place_query.strip()
    if destination_context:
        q = f"{q}, {destination_context}"

    params = {
        "engine": "google_maps",
        "type": "search",
        "q": q,
        "gl": gl,
        "hl": hl,
        "api_key": api_key,
    }

    try:
        response = requests.get("https://serpapi.com/search", params=params, timeout=30)
        data = response.json()
        if data.get("error"):
            print(f"⚠️  SerpAPI Maps error: {data['error']}")
            return None

        rows = data.get("local_results") or []
        if not rows and data.get("place_results"):
            rows = [data["place_results"]]
        if not rows:
            return None

        top = rows[0]
        gps = top.get("gps_coordinates") or {}
        lat = gps.get("latitude")
        lng = gps.get("longitude")
        if lat is None or lng is None:
            return None

        return {
            "title": top.get("title") or place_query,
            "lat": float(lat),
            "lng": float(lng),
            "address": top.get("address"),
            "place_id": top.get("place_id"),
        }
    except Exception as e:
        print(f"❌ SerpAPI Maps geocode failed for {place_query!r}: {e}")
        return None


def geocode_itinerary_stops_serpapi(
    place_queries: List[str],
    destination: str,
    max_stops: int = 12,
) -> List[Dict[str, Any]]:
    """
    Geocode an ordered list of itinerary stops (deduped). One SerpAPI call per stop.
    """
    ctx = f"{destination}, India" if destination else "India"
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for i, raw in enumerate(place_queries):
        if len(out) >= max_stops:
            break
        key = raw.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        g = geocode_place_google_maps_serpapi(raw, destination_context=ctx)
        if g:
            out.append(
                {
                    "order": len(out),
                    "query": raw,
                    "name": g["title"],
                    "lat": g["lat"],
                    "lng": g["lng"],
                    "address": g.get("address"),
                }
            )
        time.sleep(0.25)  # light pacing for SerpAPI
    return out


def get_weather_data_at_coords(lat: float, lon: float) -> Dict[str, Any]:
    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,snowfall,rain,windspeed_10m",
                "daily": "sunrise,sunset,temperature_2m_max,temperature_2m_min",
                "timezone": "Asia/Kolkata",
                "forecast_days": 1,
            },
            timeout=25,
        )
        data = response.json()
        return {
            "temp": data["current"]["temperature_2m"],
            "snowfall": data["current"]["snowfall"] > 0,
            "rainfall": data["current"]["rain"] > 0,
            "windspeed": data["current"]["windspeed_10m"],
            "sunset_time": data["daily"]["sunset"][0].split("T")[1],
            "max_temp": data["daily"]["temperature_2m_max"][0],
            "min_temp": data["daily"]["temperature_2m_min"][0],
        }
    except Exception as e:
        return {"error": f"Weather fetch failed: {str(e)}"}


def get_weather_data(destination: str) -> Dict[str, Any]:
    lat, lon = get_coordinates(destination)
    if not lat:
        return {"error": f"Could not find location: {destination}"}
    return get_weather_data_at_coords(lat, lon)



  


# ── Base Tavily Search ────────────────────────────────────
def tavily_search(query: str) -> str:
    """
    Base search function using Tavily.
    Returns clean text content for LLM to reason over.
    """
    global _tavily_call_count
    
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
def get_transport_options(origin: str, destination: str, month: str, transport_budget: int = None) -> str:
    """
    Searches train and bus options between two cities
    for a specific month. Returns fares and timings.
    """
    budget_str = f"under {transport_budget} INR" if transport_budget else ""
    query = (
        f"trains buses from {origin} to {destination} {budget_str} "
        f"India {month} 2025 fare price timings "
        f"how to reach"
    )
    return tavily_search(query)


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