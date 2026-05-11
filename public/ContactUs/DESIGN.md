---
name: OZ Rent A Plane
colors:
  surface: '#031427'
  surface-dim: '#031427'
  surface-bright: '#2a3a4f'
  surface-container-lowest: '#000f21'
  surface-container-low: '#0b1c30'
  surface-container: '#102034'
  surface-container-high: '#1b2b3f'
  surface-container-highest: '#26364a'
  on-surface: '#d3e4fe'
  on-surface-variant: '#c6c6cd'
  inverse-surface: '#d3e4fe'
  inverse-on-surface: '#213145'
  outline: '#909097'
  outline-variant: '#45464c'
  surface-tint: '#c0c6db'
  primary: '#c0c6db'
  on-primary: '#293041'
  primary-container: '#0b1221'
  on-primary-container: '#777d90'
  inverse-primary: '#575e70'
  secondary: '#ffe083'
  on-secondary: '#3c2f00'
  secondary-container: '#eec200'
  on-secondary-container: '#645000'
  tertiary: '#bcc7de'
  on-tertiary: '#263143'
  tertiary-container: '#071223'
  on-tertiary-container: '#737e93'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dce2f8'
  primary-fixed-dim: '#c0c6db'
  on-primary-fixed: '#151b2b'
  on-primary-fixed-variant: '#404758'
  secondary-fixed: '#ffe083'
  secondary-fixed-dim: '#eec200'
  on-secondary-fixed: '#231b00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

This design system embodies the precision and exclusivity of private aviation. The brand personality is authoritative yet discreet, catering to a high-net-worth audience and corporate logistics managers who value efficiency and understated luxury. 

The aesthetic is a fusion of **Minimalism** and **Glassmorphism**, leaning heavily into a sophisticated SaaS interface. The experience should feel like a modern flight deck: dark, high-contrast for readability, and technically advanced. Visual depth is achieved through layered translucency and subtle glowing signals rather than heavy textures. The interface remains quiet, allowing the "aviation yellow" accents to guide the user's eye to critical actions and status indicators.

## Colors

The palette is strictly nocturnal, utilizing a range of deep blues to create environmental depth. 

- **Deep Navy (#0B1221):** The primary canvas color, providing a solid, high-end foundation.
- **Rich Aviation Blue (#0F172A):** Used for primary containers and section backgrounds to create subtle separation from the canvas.
- **Dark Slate Blue (#1E293B):** Reserved for elevated surfaces, hover states, and interactive card backgrounds.
- **Muted Blue-Grey (#64748B):** Applied to secondary text and non-critical icons to maintain a low-noise environment.
- **Aviation Yellow (#FACC15):** The "Signal" color. Use this sparingly for primary action buttons, active status pips, and critical data points. 

Avoid any gradients that introduce hues outside of this range. All transparency effects should use white or the primary accent with low alpha values (5–12%).

## Typography

This design system utilizes a trio of sans-serif fonts to balance personality with technical precision. 

- **Hanken Grotesk** is used for high-level displays and headlines, providing a sharp, contemporary look that feels premium.
- **Inter** handles all body copy and secondary interface text, chosen for its exceptional legibility in dark mode environments.
- **Geist** is introduced for labels and data-heavy strings (like tail numbers, coordinates, and timestamps). Its technical, monospaced-leaning character reinforces the SaaS/Aviation aesthetic.

Maintain tight tracking on large headlines and slightly increased tracking on small labels to ensure clarity against dark backgrounds.

## Layout & Spacing

The layout follows a **Fixed Grid** model on desktop to maintain a cinematic, controlled composition, transitioning to a fluid model on mobile devices.

- **Grid:** A 12-column grid with a 24px gutter. Content should be centered with wide margins to evoke a sense of space and luxury.
- **Rhythm:** An 8px linear scale is used for all internal component spacing and padding.
- **Breakpoints:** 
  - Mobile: < 768px (4 columns, 16px margins)
  - Tablet: 768px - 1024px (8 columns, 24px margins)
  - Desktop: > 1024px (12 columns, fixed 1280px max-width)

Use generous whitespace (the `xl` unit) between major sections to prevent the dark UI from feeling cramped or "heavy."

## Elevation & Depth

Depth is communicated through **Glassmorphism** and light-based hierarchy rather than traditional shadows.

1.  **The Canvas:** The bottom layer (#0B1221).
2.  **Glass Layers:** Floating panels use a semi-transparent fill of `#1E293B` at 60-80% opacity with a `20px` backdrop blur. 
3.  **The Stroke:** Every elevated element must have a 1px "inner glow" border (top and left) using `rgba(255, 255, 255, 0.1)` to simulate light hitting the edge of a glass pane.
4.  **Soft Glows:** Primary action items (Yellow) should have a subtle, diffused outer glow (`drop-shadow: 0 0 15px rgba(250, 204, 21, 0.2)`) to suggest a backlit instrument panel.
5.  **Radar Patterns:** Subtle background patterns of concentric circles or grid lines in `rgba(255, 255, 255, 0.03)` can be used to add texture to large empty areas.

## Shapes

The shape language is **Soft (0.25rem)**, moving away from overly playful rounded corners toward a more professional, "instrument-grade" feel.

- **Standard Elements:** (Inputs, Small Buttons, Cards) use a 4px (0.25rem) radius.
- **Large Containers:** (Modals, Feature Cards) use 8px (0.5rem).
- **Interactive Triggers:** Select buttons or toggle switches may use a 12px (0.75rem) radius to feel more tactile, but never a full pill-shape unless it's a status badge.

Maintain crisp, clean lines to reflect the engineering excellence of the aviation industry.

## Components

- **Buttons:**
  - *Primary:* Aviation Yellow background, Navy text. High contrast, no border, subtle yellow glow on hover.
  - *Secondary:* Ghost style. 1px border in `white/20%`, white text. Background fills to `white/5%` on hover.
- **Input Fields:** 
  - Dark Slate background (#1E293B) with a subtle 1px border. Focus state changes border to Aviation Yellow and adds a faint outer glow.
- **Cards:** 
  - Utilize the glassmorphism rules. Background-blur is essential. Title text should be Hanken Grotesk, while secondary metadata uses Geist Mono.
- **Chips/Badges:** 
  - Small, rectangular with 2px radius. Use for flight status (e.g., "In Transit", "Delayed"). Only "Active" or "Critical" statuses use Aviation Yellow; all others use muted blue-grey tones.
- **Radar Signal:** 
  - A decorative or functional component displaying a pulsing point on a subtle grid. This serves as a loading state or a visual anchor for aircraft location tracking.
- **Lists:** 
  - Separated by thin 1px lines (`rgba(255, 255, 255, 0.05)`). High-density data rows should use alternating subtle fills for better scanability.