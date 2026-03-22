import os
from langgraph.graph import StateGraph, END
from agent.state import AgentState
from agent.nodes import (
    extract_node,
    research_node,
    budget_node,
    search_node,
    replan_node,
    itinerary_node
)

# ── Build Graph ───────────────────────────────────────────
graph = StateGraph(AgentState)

# ── Add Nodes ─────────────────────────────────────────────
graph.add_node("extract",   extract_node)
graph.add_node("research",  research_node)
graph.add_node("budget",    budget_node)
graph.add_node("search",    search_node)
graph.add_node("replan",    replan_node)
graph.add_node("itinerary", itinerary_node)

# ── Entry Point ───────────────────────────────────────────
graph.set_entry_point("extract")

# ── Normal Edges ──────────────────────────────────────────
graph.add_edge("extract",   "research")
graph.add_edge("research",  "budget")
graph.add_edge("budget",    "search")

# ── Conditional Edge after search ─────────────────────────
def should_replan(state: AgentState) -> str:
    if state.get("replan_flag"):
        return "replan"
    return "itinerary"

graph.add_conditional_edges(
    "search",
    should_replan,
    {
        "replan"   : "replan",
        "itinerary": "itinerary"
    }
)

# ── Conditional Edge after replan ─────────────────────────
def replan_or_end(state: AgentState) -> str:
    if state.get("replan_count", 0) >= 3:
        return "itinerary"
    return "search"

graph.add_conditional_edges(
    "replan",
    replan_or_end,
    {
        "search"   : "search",
        "itinerary": "itinerary"
    }
)

# ── End ───────────────────────────────────────────────────
graph.add_edge("itinerary", END)

# ── Compile ───────────────────────────────────────────────
app = graph.compile()
