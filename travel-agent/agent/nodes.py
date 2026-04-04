import os
import re
import json
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv
from agent.state import AgentState
from agent.tools import (
    get_weather_data,
    get_weather_data_at_coords,
    get_hotel_prices_serpapi,
    get_hotel_prices_tavily,
    get_current_situation,
    get_transport_options,
    reset_tavily_counter,
)

load_dotenv()

# ── Initialize Groq ───────────────────────────────────────
client = Groq(api_key=os.getenv("GROQ_API"))

# ── API Counter ───────────────────────────────────────────
_groq_call_count = 0
GROQ_LIMIT       = 10

def reset_groq_counter():
    global _groq_call_count
    _groq_call_count = 0

# ── Load System Prompt (path works from any cwd) ──────────
_PROMPT_FILE = Path(__file__).resolve().parent.parent / "prompts" / "system_prompt.txt"
with open(_PROMPT_FILE, "r", encoding="utf-8") as f:
    system_prompt = f.read()

# ── Helper — LLM call ─────────────────────────────────────
def llm_call(prompt: str,
             model: str    = "llama-3.3-70b-versatile",
             json_mode: bool = False) -> str:
    global _groq_call_count

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

    completion = client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content


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

    # Month
    months = ["january","february","march","april","may","june",
              "july","august","september","october","november","december"]
    for month in months:
        if month in msg:
            state["travel_month"] = month.capitalize()
            break

    # People
    people_match = re.search(r'(\d+)\s*(?:people|person|persons|pax)', msg)
    if people_match:
        state["num_people"] = int(people_match.group(1))

    # ── Groq — only for destination (regex can't do this) ─
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


# ── Node 2: Research ──────────────────────────────────────
def research_node(state: AgentState) -> AgentState:
    destination = state["destination"]
    month       = state.get("travel_month", "current month")
    nights      = state.get("nights", 3)
    num_people  = state.get("num_people", 2)

    # 1. Weather — use exact coords from UI if provided; else geocode name
    lat, lng = state.get("destination_lat"), state.get("destination_lng")
    if lat is not None and lng is not None:
        state["weather_data"] = get_weather_data_at_coords(float(lat), float(lng))
    else:
        state["weather_data"] = get_weather_data(destination)

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

    return state


# ── Node 4: Search ────────────────────────────────────────
def search_node(state: AgentState) -> AgentState:
    nights           = state.get("nights", 3)
    num_people       = state.get("num_people", 2)
    budget_per_night = state["hotel_budget"] // nights

    # ── Hotels — SerpAPI Google Hotels (structured, no LLM needed)
    serpapi_hotels = get_hotel_prices_serpapi(
        state["destination"],
        state.get("travel_month", ""),
        nights=nights,
        adults=num_people,
    )
    state["hotels"] = serpapi_hotels if serpapi_hotels else []

    # ── Transport — Tavily + Groq (no structured API exists)
    transport_raw = get_transport_options(
        state.get("origin", "Delhi"),
        state["destination"],
        state.get("travel_month", "")
    )

    # Groq to parse transport only (saves 1 LLM call vs before)
    prompt = f"""
From this search data, extract 1-2 best transport options.

STRICT RULES:
- Only use prices EXPLICITLY mentioned in the data
- NEVER invent or estimate prices
- If price not found → set to null

Transport data: {transport_raw}

Return ONLY JSON:
{{
  "transport_options": [
    {{"type": str, "name": str, 
      "fare": int or null, "duration": str}}
  ]
}}
"""
    try:
        response = llm_call(prompt, json_mode=True)
        parsed   = json.loads(response)
        state["transport_options"] = parsed.get("transport_options", [])
    except Exception as e:
        print(f"Transport parse error: {e}")
        state["transport_options"] = []

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


# ── Node 6: Itinerary ─────────────────────────────────────
def itinerary_node(state: AgentState) -> AgentState:
    if not state.get("warnings"):
        state["warnings"] = []

    prompt = f"""
Build a complete day-by-day travel itinerary.

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

Hotels found      : {state['hotels']}
Transport found   : {state['transport_options']}

Write day-by-day itinerary in Markdown.
Include timings, meals, places, safety warnings, what to carry.
Never plan outdoor activities after sunset time in weather data.
"""
    try:
        state["itinerary"] = llm_call(prompt)
        state["budget_breakdown"] = {
            "Hotel"      : state["hotel_budget"],
            "Transport"  : state["transport_budget"],
            "Food"       : state["food_budget"],
            "Activities" : state["activities_budget"],
        }
    except Exception as e:
        print(f"Itinerary error: {e}")
        state["itinerary"] = "Could not generate itinerary. Please try again."

    return state

