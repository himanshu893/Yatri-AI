import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import urlopen

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
REPO_DIR = BASE_DIR.parent
REPO_ENV = REPO_DIR / ".env"
TRAVEL_AGENT_ENV = BASE_DIR / ".env"


def _load_env_files() -> None:
    # Load both supported env locations. The travel-agent .env wins when both exist.
    load_dotenv(REPO_ENV)
    load_dotenv(TRAVEL_AGENT_ENV, override=True)


_load_env_files()

os.chdir(BASE_DIR)
sys.path.insert(0, str(BASE_DIR))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from agent.graph import app  # noqa: E402


HOST = os.getenv("YATRI_API_HOST", "127.0.0.1")
PORT = int(os.getenv("YATRI_API_PORT", "8000"))


def _secret_status(*names: str) -> Dict[str, Any]:
    present = []
    length = None
    for name in names:
        value = os.getenv(name)
        if value:
            present.append(name)
            length = len(value.strip())
    return {"present": bool(present), "names": present, "length": length}


def _debug_status() -> Dict[str, Any]:
    _load_env_files()
    return {
        "ok": True,
        "server": "travel-agent-api",
        "host": HOST,
        "port": PORT,
        "cwd": str(Path.cwd()),
        "env_files": {
            "repo_env": {"path": str(REPO_ENV), "exists": REPO_ENV.exists()},
            "travel_agent_env": {
                "path": str(TRAVEL_AGENT_ENV),
                "exists": TRAVEL_AGENT_ENV.exists(),
            },
        },
        "keys": {
            "groq": _secret_status("GROQ_API", "GROQ_API_KEY"),
            "serpapi": _secret_status("SERPAPI_KEY", "SERPAPI"),
            "tavily": _secret_status("TAVILY_API_KEY", "TAVILY_API", "TAILVY_API"),
        },
    }


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


def _as_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _initial_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    destination = str(payload.get("destination") or "").strip()
    origin = str(payload.get("origin") or "Delhi").strip() or "Delhi"
    budget = _as_int(payload.get("budget"), 0)
    travel_month = payload.get("travel_month") or "current month"
    num_people = max(1, _as_int(payload.get("num_people"), 1))
    nights = max(1, _as_int(payload.get("nights"), 3))

    user_message = (
        f"Plan a trip from {origin} to {destination}, budget {budget}, "
        f"{travel_month}, {num_people} people for {nights} nights"
    )

    return {
        "destination": destination or None,
        "destination_label": payload.get("destination_label"),
        "destination_latitude": payload.get("destination_latitude"),
        "destination_longitude": payload.get("destination_longitude"),
        "budget": budget or None,
        "travel_month": travel_month,
        "num_people": num_people,
        "nights": nights,
        "origin": origin,
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
        "transport_by_mode": {"train": [], "flight": [], "bus": [], "taxi": []},
        "places_to_visit": [],
        "replan_count": 0,
        "replan_flag": False,
        "replan_reason": None,
        "itinerary": None,
        "warnings": [],
        "budget_breakdown": None,
        "ask_user_flag": False,
        "chat_history": [{"role": "user", "content": user_message}],
        "extracted_entities": {},
        "tavily_calls": 0,
        "groq_calls": 0,
    }


def _group_transport(options: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {
        "train": [],
        "flight": [],
        "bus": [],
        "taxi": [],
    }
    for option in options:
        mode = str(option.get("type") or "other").lower()
        grouped.setdefault(mode, []).append(option)
    return grouped


def _plan_trip(payload: Dict[str, Any]) -> Dict[str, Any]:
    _load_env_files()

    if not str(payload.get("destination") or "").strip():
        raise ValueError("destination is required")
    if _as_int(payload.get("budget"), 0) < 1000:
        raise ValueError("budget must be at least 1000")

    result = app.invoke(_initial_state(payload))
    transport_options = result.get("transport_options") or []
    transport_by_mode = result.get("transport_by_mode") or _group_transport(transport_options)

    return {
        "destination": result.get("destination") or payload.get("destination"),
        "destination_label": payload.get("destination_label") or result.get("destination"),
        "budget": result.get("budget") or payload.get("budget"),
        "travel_month": result.get("travel_month") or payload.get("travel_month"),
        "num_people": result.get("num_people") or payload.get("num_people"),
        "nights": result.get("nights") or payload.get("nights"),
        "origin": result.get("origin") or payload.get("origin"),
        "weather_data": result.get("weather_data"),
        "hotel_price_trend": result.get("hotel_price_trend"),
        "current_situation": result.get("current_situation"),
        "season_info": result.get("season_info"),
        "hotel_budget": result.get("hotel_budget"),
        "transport_budget": result.get("transport_budget"),
        "food_budget": result.get("food_budget"),
        "activities_budget": result.get("activities_budget"),
        "budget_reasoning": result.get("budget_reasoning"),
        "hotels": result.get("hotels") or [],
        "transport_options": transport_options,
        "transport_by_mode": transport_by_mode,
        "warnings": result.get("warnings") or [],
        "itinerary": result.get("itinerary"),
        "budget_breakdown": result.get("budget_breakdown"),
        "itinerary_place_queries": result.get("itinerary_place_queries") or [],
        "map_waypoints": result.get("map_waypoints") or [],
        "hotel_map_pins": result.get("hotel_map_pins") or [],
        "ask_user_flag": bool(result.get("ask_user_flag")),
        "replan_count": result.get("replan_count") or 0,
        "route_map_url": result.get("route_map_url"),
    }


def _destination_candidates(query: str, limit: int) -> Dict[str, Any]:
    if len(query.strip()) < 2:
        return {"query": query, "candidates": []}

    url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={quote(query)}&count={limit}&language=en&format=json"
    )
    try:
        with urlopen(url, timeout=12) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception:
        data = {"results": []}

    candidates = []
    for index, item in enumerate(data.get("results") or []):
        name = item.get("name") or query
        parts = [name, item.get("admin1"), item.get("country")]
        label = ", ".join(str(part) for part in parts if part)
        candidates.append(
            {
                "id": f"open_meteo:{index}:{item.get('latitude')}:{item.get('longitude')}",
                "name": name,
                "label": label or name,
                "lat": item.get("latitude"),
                "lng": item.get("longitude"),
                "source": "open_meteo",
                "region": item.get("admin1"),
                "country": item.get("country"),
                "population": item.get("population"),
                "address": label or name,
                "rating": None,
                "reviews": None,
            }
        )
    return {"query": query, "candidates": candidates}


class YatriApiHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        _json_response(self, 204, {})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/v1/health":
            _json_response(self, 200, {"ok": True})
            return

        if parsed.path == "/api/v1/debug":
            _json_response(self, 200, _debug_status())
            return

        if parsed.path == "/api/v1/destinations/search":
            params = parse_qs(parsed.query)
            query = (params.get("q") or [""])[0]
            limit = min(20, max(1, _as_int((params.get("limit") or [10])[0], 10)))
            _json_response(self, 200, _destination_candidates(query, limit))
            return

        _json_response(self, 404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/v1/plan":
            _json_response(self, 404, {"error": "Not found"})
            return

        try:
            payload = _read_json(self)
            _json_response(self, 200, _plan_trip(payload))
        except ValueError as exc:
            _json_response(self, 400, {"error": str(exc)})
        except Exception as exc:
            _json_response(self, 500, {"error": f"Planner failed: {exc}"})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[api] {self.address_string()} - {fmt % args}")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), YatriApiHandler)
    print(f"Yatri API running at http://{HOST}:{PORT}")
    print("Frontend Vite proxy already points /api to this server.")
    server.serve_forever()


if __name__ == "__main__":
    main()
