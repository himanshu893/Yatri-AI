# Design System: The Ethereal Navigator

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

In an era of information overload, this system moves away from the "database" aesthetic of traditional travel sites. It focuses on clarity, breathability, and editorial sophistication. We break the "template" look through **intentional asymmetry**—offsetting imagery against generous whitespace—and **tonal depth**. Instead of rigid grids, we use overlapping glass layers to create a sense of physical space. The goal is to make the user feel like they are flipping through a premium travel magazine that happens to be powered by world-class AI.

---

## 2. Colors: Tonal Atmosphere
Our palette is rooted in the interplay between light and depth. We do not use "flat" colors; we use "atmospheric" values.

### The Palette (Material Scale)
*   **Primary Core:** `primary` (#0a47ee) to `primary_container` (#3e65ff).
*   **Surfaces:** Base `surface` (#f7f9fb) transitioning into `surface_container_lowest` (#ffffff) for maximum elevation.
*   **Accents:** `secondary` (#4648d4) for navigational wayfinding.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit the use of 1px solid borders for sectioning. 
Boundaries must be defined solely through background color shifts. To separate a hero section from a search results list, transition from `surface` to `surface_container_low`. The eye should perceive a change in "plane" rather than a "cut" in the page.

### The "Glass & Gradient" Rule
To achieve the signature look, all floating UI elements (modals, navigation bars, hover cards) must utilize **Glassmorphism**.
*   **Recipe:** `surface` color at 70% opacity + 20px Backdrop Blur.
*   **Gradients:** Use a linear gradient (135°) from `primary` to `secondary` for all primary CTAs. This provides a "visual soul" that feels more dynamic than a static hex code.

---

## 3. Typography: Editorial Authority
We utilize a dual-font strategy to balance utility with high-end editorial flair.

*   **Display & Headline (Plus Jakarta Sans):** Chosen for its geometric precision and modern warmth. Use `display-lg` (3.5rem) with tight letter-spacing (-0.02em) for hero moments. This creates a bold, authoritative voice.
*   **Body & UI (Inter):** The workhorse for utility. Use `body-md` (0.875rem) for travel itineraries and dense information. Inter’s high x-height ensures readability even on small mobile screens.
*   **The Hierarchy:** Use `headline-sm` (1.5rem) to introduce new sections, paired with generous `surface_container` padding to allow the typography to "breathe."

---

## 4. Elevation & Depth: Tonal Layering
We reject the standard Material Design drop-shadow. We build depth through **Tonal Layering** and **Ambient Light**.

### The Layering Principle
Think of the UI as stacked sheets of frosted glass.
1.  **Base Layer:** `surface` (#f7f9fb)
2.  **Section Layer:** `surface_container_low` (#f2f4f6)
3.  **Component Layer (Card):** `surface_container_lowest` (#ffffff)

### Ambient Shadows
When an element must float (e.g., a "Book Now" sticky button):
*   **Blur:** 40px to 60px.
*   **Opacity:** 4% - 8%.
*   **Color:** Use a tinted version of `on_surface` (#191c1e) mixed with `primary`. This prevents "dirty" grey shadows and mimics natural light refraction.

### The "Ghost Border" Fallback
If accessibility requires a container edge, use a **Ghost Border**: `outline_variant` at 15% opacity. It should feel like a faint suggestion of a boundary, not a hard stop.

---

## 5. Components: Fluid Primitives

### Buttons
*   **Primary:** Gradient (`primary` to `secondary`), `full` (pill) roundedness, white text. No shadow on rest; `lg` shadow on hover.
*   **Tertiary:** No background. Use `primary` text with a `surface_variant` hover state.

### Input Fields (The "Sleek" Input)
*   **Visuals:** Background `surface_container_highest` with 0% border. On focus, transition background to `surface_container_lowest` and apply a 2px `primary` "Ghost Border."
*   **Shape:** `md` (1.5rem) corner radius to match the soft aesthetic.

### Cards & Lists
*   **The Card Rule:** Roundedness at `lg` (2rem). 
*   **Anti-Divider Policy:** Forbid 1px horizontal dividers. To separate itinerary items, use vertical whitespace (24px - 32px) or a alternating subtle shift between `surface_container_low` and `surface_container_high`.
*   **Imagery:** All imagery within cards must have a `0.5rem` inner padding from the card edge to create a "framed" gallery effect.

### Travel-Specific Components
*   **The Itinerary Timeline:** A vertical track using `outline_variant` at 20% opacity. Travel nodes use `primary` gradient "glow" dots.
*   **The Glass Drawer:** Mobile-first navigation that slides from the bottom, using 80% `surface_container_lowest` and high-density backdrop blur.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Whitespace:** If a section feels crowded, double the padding before you consider a border.
*   **Use Asymmetry:** Offset images to the left or right of text blocks to create a custom, high-end editorial feel.
*   **Focus on Micro-Transitions:** When a card is tapped, use a `200ms` ease-out scale effect (1.02x) rather than a simple color change.

### Don't:
*   **Don't use pure black:** Even for dark mode, use `on_surface` or `inverse_surface` to keep the palette soft.
*   **Don't stack borders:** Never place a bordered button inside a bordered card. It breaks the "glass" metaphor.
*   **Don't use standard shadows:** Avoid the `0px 2px 4px` default. Always favor high-blur, low-opacity ambient light.