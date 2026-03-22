import os
import time
import requests
from typing import Dict, Any
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