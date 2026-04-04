"""
Heuristic extraction of visitable stop names from markdown itineraries
for map geocoding (SerpAPI). Best-effort; skips meals and generic lines.
"""

import re
from typing import List

_SKIP = (
    "breakfast",
    "lunch",
    "dinner",
    "brunch",
    "meal",
    "hotel",
    "check-in",
    "checkout",
    "check-out",
    "arrival",
    "departure",
    "rest day",
    "buffer",
    "travel to",
    "en route",
    "₹",
    "inr",
    "rupees",
    "estimated",
    "cost:",
    "free time",
    "leisure",
)


def _clean_bullet_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^[\-\*•]\s*", "", text)
    text = re.sub(r"^\d+[\.)]\s*", "", text)
    text = re.sub(r"^\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"^__([^_]+)__", r"\1", text)
    text = re.sub(r"^[:\-\s]+", "", text)
    # drop trailing timing fragments
    text = re.sub(r"\s*[\(\[].*[\)\]]\s*$", "", text).strip()
    return text.strip(" -•\t")


def extract_place_candidates_from_itinerary(
    markdown: str,
    max_places: int = 18,
) -> List[str]:
    if not markdown or not markdown.strip():
        return []

    candidates: List[str] = []

    for m in re.finditer(r"\*\*([^*]{3,100})\*\*", markdown):
        chunk = m.group(1).strip()
        low = chunk.lower()
        if any(s in low for s in _SKIP):
            continue
        if len(chunk) >= 4:
            candidates.append(chunk)

    for line in markdown.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if not re.match(r"^[\-\*•]|\d+[\.)]\s", line):
            continue
        text = _clean_bullet_text(line)
        if len(text) < 5 or len(text) > 140:
            continue
        low = text.lower()
        if any(s in low for s in _SKIP):
            continue
        candidates.append(text)

    seen: set = set()
    out: List[str] = []
    for c in candidates:
        k = c.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(c)
        if len(out) >= max_places:
            break
    return out
