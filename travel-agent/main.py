from agent.graph import app

# ── User Input ────────────────────────────────────────────
print("Welcome to Yatri AI Travel Planner!")
origin = input("Enter your origin city: ").strip()
destination = input("Enter your destination: ").strip()
budget = input("Enter your total budget (INR): ").strip()
travel_month = input("Enter travel month (e.g., December): ").strip()
num_people = input("Enter number of people: ").strip()
nights = input("Enter number of nights: ").strip()

# Construct user message
user_message = f"Plan a trip from {origin} to {destination}, budget {budget}, {travel_month}, {num_people} people for {nights} nights"

# ── Initial State ─────────────────────────────────────────
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
    "transport_by_mode": {},
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
            "content": user_message
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
transport_by_mode = result.get("transport_by_mode") or {}
mode_meta = [
    ("train", "🚂", "TRAIN"),
    ("flight", "✈️", "FLIGHT"),
    ("bus", "🚌", "BUS"),
    ("taxi", "🔹", "TAXI"),
]

for mode_key, mode_emoji, mode_title in mode_meta:
    entries = transport_by_mode.get(mode_key, [])
    if not entries:
        continue

    print(f"\n  {mode_emoji} {mode_title} ({len(entries)} options)")
    print("  " + "─" * 50)
    for option in entries:
        route = option.get("route", option.get("name", "Unknown route"))
        name = option.get("name")
        code = option.get("code", "N/A")
        fare = option.get("fare")
        fare_text = f"₹{fare}" if fare is not None else "N/A"
        duration = option.get("duration", "N/A")
        departure = option.get("departure")
        arrival = option.get("arrival")
        title = f"{name} - {route}" if name and name != route else route
        print(f"    {title} [{code}]")
        time_text = f"{departure} → {arrival}" if departure and arrival else duration
        print(f"      💵 Fare: {fare_text}  🕐 {time_text} ({duration})")
        if option.get("description"):
            print(f"      ℹ️ {option.get('description')}")
        for cls in option.get("classes", []):
            print(
                f"        └─ {cls.get('classType', 'Class')}: "
                f"{cls.get('fare', 'N/A')} | {cls.get('status', 'N/A')}"
            )

print("\n⚠️  WARNINGS:")
for w in result.get("warnings", []):
    print(f"  - {w}")

print("\n📋 ITINERARY:")
print(result.get("itinerary"))
