from agent.graph import app

# ── Test Input ────────────────────────────────────────────
initial_state = {
    # User inputs
    "destination":      None,
    "budget":           None,
    "travel_month":     None,
    "num_people":       None,
    "nights":           None,
    "origin":           None,

    # Research
    "weather_data":     None,
    "hotel_price_trend":None,
    "current_situation":None,
    "season_info":      None,

    # Budget
    "hotel_budget":     None,
    "transport_budget": None,
    "food_budget":      None,
    "activities_budget":None,
    "budget_reasoning": None,

    # Search
    "hotels":           [],
    "transport_options":[],
    "places_to_visit":  [],

    # Replanning
    "replan_count":     0,
    "replan_flag":      False,
    "replan_reason":    None,

    # Output
    "itinerary":        None,
    "warnings":         [],
    "budget_breakdown": None,

    # Chat
    "ask_user_flag":    False,
    "chat_history": [
        {
            "role": "user",
            "content": "Plan a trip to Manali, budget 70000, December, 2 people from mumbai"
        }
    ],
    "extracted_entities": {},
    "tavily_calls": 0,
    "groq_calls": 0
}

# ── Run ───────────────────────────────────────────────────
print("\n🚀 Running travel agent...\n")
result = app.invoke(initial_state)

# ── Print Results ─────────────────────────────────────────
print("=" * 60)
print("DESTINATION  :", result.get("destination"))
print("BUDGET       :", result.get("budget"))
print("MONTH        :", result.get("travel_month"))
print("NIGHTS       :", result.get("nights"))
print("PEOPLE       :", result.get("num_people"))
print("=" * 60)

print("\n📊 BUDGET BREAKDOWN:")
print("Hotel        : ₹", result.get("hotel_budget"))
print("Transport    : ₹", result.get("transport_budget"))
print("Food         : ₹", result.get("food_budget"))
print("Activities   : ₹", result.get("activities_budget"))
print("Reasoning    :", result.get("budget_reasoning"))

print("\n🌤️  WEATHER:")
print(result.get("weather_data"))

print("\n🏨 HOTELS FOUND:")
for h in result.get("hotels", []):
    print(f"  - {h}")

print("\n🚂 TRANSPORT OPTIONS:")
for t in result.get("transport_options", []):
    print(f"  - {t}")

print("\n⚠️  WARNINGS:")
for w in result.get("warnings", []):
    print(f"  - {w}")

print("\n📋 ITINERARY:")
print(result.get("itinerary"))