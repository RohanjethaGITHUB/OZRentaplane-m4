# Design System Strategy: The Blue Hour Editorial

This document serves as the foundation for the visual and experiential language of our premium aviation platform. As designers, your goal is to move away from the "utility-first" aesthetic of common SaaS tools and instead lean into the quiet confidence of high-end editorial design. We are not just renting planes; we are curating a transition from the ground to the sky.

---

### 1. Overview & Creative North Star

**Creative North Star: "The Horizon Line"**
Our design philosophy centers on the "Blue Hour"—that moment of perfect stillness just after sunset when the sky is deep, tonal, and expansive. The UI should feel like a cockpit at dusk: technologically advanced yet calming, minimal yet powerful.

To break the "template" look, we utilize a **Split-Screen Desktop Architecture**. One side of the screen should feel cinematic (large-scale imagery, deep tonal washes), while the other side acts as an editorial workspace (clean typography, glass panels). We embrace **intentional asymmetry**—offsetting text and utilizing negative space to guide the eye, rather than cramming content into a rigid 12-column grid.

---

### 2. Colors: Tonal Depth & The Blue-Hour Palette

Our palette is rooted in the deep spectrum of aviation. We use Material Design token naming, but our application is strictly bespoke.

*   **Primary (`#b7c8de`) & Secondary (`#b4c9db`):** These are not "brand colors" in the traditional sense; they are light sources. Use them for focus states and refined accents.
*   **Surface Hierarchy (`#111316` to `#333538`):** We define depth through tonal shifts.
    *   **Surface Dim/Lowest:** Use for the base background.
    *   **Surface Container Low:** Use for secondary UI regions.
    *   **Surface Container Highest:** Use for active, floating elements or high-priority panels.

**The "No-Line" Rule**
Standard 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined solely through background color shifts. If you need to separate two sections, move from `surface-container-low` to `surface-container-lowest`. 

**The "Glass & Gradient" Rule**
To achieve a "Cinematic" feel, use **Glassmorphism**. Floating panels should utilize `surface-container` colors with a 60-80% opacity and a `20px to 40px` backdrop-blur. Apply a subtle linear gradient from `primary` (at 5% opacity) to `transparent` on the top-left corner of containers to simulate cockpit lighting hitting a glass surface.

---

### 3. Typography: Editorial Authority

We use a high-contrast pairing to create a "Magazine" feel.

*   **Display & Headlines (Noto Serif):** Our serif is our voice—elegant and exclusive. Use `display-lg` for hero statements. Ensure you use wide tracking (letter-spacing) on `headline-sm` to give the serif a modern, airy feel.
*   **Body & Labels (Manrope):** Our sans-serif is our instrument—functional and clean. `body-lg` is the standard for long-form content. 
*   **Hierarchy Tip:** Never use Noto Serif for functional UI (buttons, inputs). Serifs are for "Storytelling"; Sans-serifs are for "Action."

---

### 4. Elevation & Depth: Tonal Layering

We do not use drop shadows to create "lift." We use light and opacity.

*   **The Layering Principle:** Depth is achieved by stacking surface tiers. A `surface-container-highest` card sitting on a `surface-container-low` section creates a natural, soft lift.
*   **Ambient Shadows:** If a floating element (like a modal) requires a shadow, use a "Tinted Ambient Shadow." The shadow should be extra-diffused (`blur: 60px`) and use a low-opacity version of the `primary` color (4%-8% opacity) rather than black.
*   **The "Ghost Border" Fallback:** For accessibility in forms, use a "Ghost Border" using the `outline-variant` token at 15% opacity. Never use 100% opaque outlines.

---

### 5. Components: Refined Interaction

#### Buttons
*   **Primary:** A soft gradient from `primary` to `primary-container`. High roundedness (`full`). Typography: `label-md` in all-caps with 0.05em tracking.
*   **Secondary:** No background fill. Use a `Ghost Border` (outline-variant at 20%) and `on-surface` text.
*   **Interactions:** On hover, increase the backdrop-blur of the button rather than just changing the color.

#### Input Fields
*   **Visual Style:** Forgo the "box." Use a `surface-container-low` background with a `Ghost Border` only on the bottom edge—inspired by runway markings.
*   **States:** On focus, the bottom border transitions to `primary` with a subtle outer glow (bloom effect).

#### Cards & Lists
*   **The Runway Divider:** Instead of a line, use "Vertical White Space" from our spacing scale. If a divider is necessary, use a short, centered 2px tall line using `outline-variant` that doesn't span the full width of the container.
*   **Containers:** All main containers must use `rounded-xl` (1.5rem) to maintain the "Modern/Minimal" personality.

#### Chips
*   **Action Chips:** Use `secondary-container` with `on-secondary-container` text. These should feel like tactile "toggles" in a premium aircraft cabin.

---

### 6. Do’s and Don’ts

**Do:**
*   **DO** use "Split-Screen" layouts where the left side is a high-resolution, "Blue-Hour" aviation visual and the right side is the functional UI.
*   **DO** use `surface-bright` for very subtle "rim lighting" on the edges of top-level containers.
*   **DO** lean into "Focus/Blur" transitions. When a modal opens, the background shouldn't just dim; it should heavily blur (30px).

**Don’t:**
*   **DON'T** use generic travel icons (e.g., the standard "airplane" icon). Use refined, thin-stroke custom iconography.
*   **DON'T** use pure black `#000000` or pure white `#FFFFFF`. Use `background` and `on-background` for a softer, cinematic contrast.
*   **DON'T** use standard Material "Ripple" effects. Use soft "Fade-in" transitions for hover and active states.

---

### 7. Signature Elements for Aviation

*   **The Flight Progress Tracker:** Instead of a standard stepper, use a "Runway Path"—a single horizontal line with soft glowing nodes in `primary` that pulse subtly when active.
*   **The "Haze" Overlay:** Apply a very subtle grain texture (3% opacity) over the entire UI to give the digital surface a tactile, film-like quality.