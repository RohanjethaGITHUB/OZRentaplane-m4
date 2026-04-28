# Design System Specification

## 1. Overview & Creative North Star: "The Atmospheric Navigator"
This design system is a departure from the utilitarian, high-contrast rigidity often found in aviation software. Our Creative North Star is **"The Atmospheric Navigator."** We aim to replicate the cinematic feeling of soaring through a high-altitude mist—where the world is defined not by harsh lines, but by gradients of light, depth, and tonal shifts.

To break the "template" look, this system prioritizes **intentional asymmetry** and **editorial pacing**. Instead of a standard 12-column grid that feels mechanical, we use oversized Newsreader serifs paired with generous, unequal margins to create a layout that feels curated, like a premium flight journal. Elements should overlap slightly, mimicking the way clouds layer over a horizon, providing a sense of immersion and high-trust sophistication.

---

## 2. Colors: The Depth of the Stratosphere
Our palette avoids the "tech-black" aesthetic. We use a foundation of deep midnight and steel blues to create a rich, expansive environment.

### Surface Hierarchy & Nesting
We reject the flat UI. Depth is achieved through "Tonal Nesting" using the following logic:
- **Base Layer:** `surface` (`#091421`) or `surface_dim`.
- **Secondary Sections:** `surface_container_low` (`#121c29`) to create subtle distinction.
- **Interactive/Raised Elements:** `surface_container_high` (`#212b38`) or `highest` (`#2b3544`) to bring content toward the user.

### Key Rules
*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through color shifts between `surface` tiers. If you need a divider, use a `1.5` (0.5rem) spacing gap to let the background color act as the separator.
*   **The "Glass & Gradient" Rule:** Floating panels (like navigation or tooltips) must use `surface_container` tokens at 80% opacity with a `20px` backdrop-blur. 
*   **Signature Textures:** For primary CTAs and Hero backgrounds, use a linear gradient from `primary` (`#aec7f7`) to `primary_container` (`#1b365d`) at a 135-degree angle. This provides a "metallic wing" sheen that flat color cannot replicate.

---

## 3. Typography: Editorial Authority
The type system balances the romanticism of flight with the precision of instrumentation.

*   **Display & Headlines (Newsreader):** Use `display-lg` through `headline-sm` for all storytelling and high-level navigation. The Newsreader serif communicates heritage, luxury, and authority. Use `display-lg` (`3.5rem`) with `tight` letter-spacing for a high-end editorial impact.
*   **Technical & Body (Manrope):** Use `title-md` down to `label-sm` for all data, labels, and instructional text. Manrope’s geometric clarity ensures legibility in technical aviation contexts. 
*   **The Hierarchy Play:** Never pair a serif headline with a serif subline. Always anchor a `headline-lg` (Newsreader) with a `title-sm` (Manrope) in `on_surface_variant` (`#c4c6cf`) for a sophisticated, "magazine-style" contrast.

---

## 4. Elevation & Depth: Tonal Layering
In this system, light is your primary architect. We move away from structural lines toward "Ambient Volume."

*   **The Layering Principle:** To lift a card, do not reach for a shadow first. Move from `surface_container_low` to `surface_container_highest`. The shift in blue-tone creates a natural "atmospheric perspective."
*   **Ambient Shadows:** When a physical float is required (e.g., a flight planning modal), use a custom shadow: `0 20px 40px rgba(5, 15, 27, 0.4)`. The shadow is a deeper tint of the background, not grey, ensuring it feels like a part of the environment.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-glare environments), use `outline_variant` (`#44474e`) at **15% opacity**. It should be felt, not seen.
*   **Glassmorphism:** Use `surface_bright` (`#303a48`) with `0.7` alpha for any element that sits atop high-detail imagery, ensuring the "mist-like" quality of the UI remains consistent.

---

## 5. Components: The Instrumentation
Components should feel like high-end flight deck controls—tactile, precise, and refined.

*   **Buttons:**
    *   **Primary:** A gradient of `primary` to `secondary`. Text is `on_primary` (`#143057`). Radius: `md` (`0.375rem`).
    *   **Tertiary:** No background. Use `primary` text with a `label-md` weight. 
*   **Cards:** Never use a border. Use `surface_container_low` against a `surface` background. For internal padding, use `spacing-6` (`2rem`) to ensure an "airy" feel.
*   **Input Fields:** Use `surface_container_highest` for the field background. The active state is signaled by a 2px `primary_fixed` bottom-bar rather than a full box highlight.
*   **Lists:** Forbid divider lines. Use `spacing-3` between list items and alternate between `surface` and `surface_container_low` if the list is data-heavy.
*   **Aviation Gauges (Custom):** For any data visualization, use `tertiary` (`#a9cbe4`) for "safe" zones and `primary` for "active" data. Avoid "warning red" unless it is a critical system failure; use `error` (`#ffb4ab`) sparingly to maintain the "calm" mood.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical layouts. Place a large Newsreader headline on the far left and the body copy on the right, separated by a 2-column gap.
*   **Do** use the `20` (`7rem`) and `24` (`8.5rem`) spacing tokens for section headers to create a "cinematic" sense of space.
*   **Do** apply `surface_tint` at 5% opacity over hero images to unify the photography with the UI color palette.

### Don’t:
*   **Don't** use pure black or charcoal. It breaks the "atmospheric blue" immersion.
*   **Don't** use 100% opaque, high-contrast borders. They feel "cheap" and "out-of-the-box."
*   **Don't** use Newsreader for labels or technical data. It is reserved for "The Narrative."
*   **Don't** crowd the interface. If a screen feels busy, increase the background surface area using the `surface_dim` token.