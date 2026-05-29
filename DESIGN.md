---
name: OZRentAPlane
description: Aircraft wet-hire booking platform for licensed and student pilots operating from Bankstown Airport, Sydney.
colors:
  # Dark surface stack (product shell + marketing hero)
  midnight-apron: "#00132f"
  night-hangar: "#000e25"
  service-bay: "#051b39"
  ops-panel: "#0a1f3d"
  instrument-surround: "#162a48"
  control-header: "#223554"
  # Blue accents
  clearsky: "#a7c8ff"
  haze-blue: "#608bca"
  # Marketing light surface
  open-ceiling: "#dce8f8"
  overcast: "#edf4fc"
  cloud-white: "#ffffff"
  horizon-border: "#dbeafe"
  weather-line: "#bfdbfe"
  # Text
  sky-text: "#d6e3ff"
  cloud-muted: "#c4c6ce"
  smoke: "#8e9098"
  deep-ink: "#0d1b3e"
  # Signal
  runway-amber: "#f59e0b"
  runway-amber-hot: "#fbbf24"
  nav-blue: "#2563eb"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(2.25rem, 5vw, 4.5rem)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "0.015em"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "clamp(1.625rem, 3vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "normal"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.15em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.runway-amber}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.md}"
    padding: "16px 32px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.runway-amber-hot}"
    textColor: "{colors.deep-ink}"
  button-nav-cta:
    backgroundColor: "{colors.nav-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "8px 20px"
  button-nav-cta-hover:
    backgroundColor: "#3b82f6"
    textColor: "#ffffff"
  button-auth:
    backgroundColor: "{colors.clearsky}"
    textColor: "{colors.midnight-apron}"
    rounded: "{rounded.pill}"
    padding: "14px 32px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.clearsky}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
  card-light:
    backgroundColor: "{colors.cloud-white}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.lg}"
    padding: "32px"
  card-dark:
    backgroundColor: "{colors.ops-panel}"
    textColor: "{colors.sky-text}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input-dark:
    backgroundColor: "rgba(255,255,255,0.09)"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "14px"
---

# Design System: OZRentAPlane

## 1. Overview

**Creative North Star: "The Cleared for Departure Brief"**

This system is a pre-flight briefing made visual: everything the pilot needs to know, nothing that doesn't belong. The design's job is confidence, not excitement. Every element earns its place the way a checklist item earns its place — by being necessary. Beauty here is the beauty of something that works.

The system operates across two surfaces. The **dark surface** (marketing hero, customer portal) is the cockpit: deep navy panels layered in ascending lightness, instruments lit in cool-sky blue, no ambient noise. The **light surface** (marketing content sections) is the operations documentation: a blue-white ground with navy ink and precise borders — legible, structured, trusted. Both surfaces share the same type system and the same sparse amber signal.

The amber note (#f59e0b) is the one warm element in an otherwise cool system. It appears only on the primary booking CTA and as a hover signal in the footer. Its rarity is its meaning: when amber appears, something actionable is there. Everything else steps back.

Motion is choreographed in the hero (GSAP scroll-driven sequences are an intentional product feature) and restrained everywhere else. The portal and booking flow use state transitions only — no entrances, no choreography, no distractions from the task at hand.

This system explicitly rejects: legacy flight school websites (clip-art planes, 2010-era layouts, clip-art photography, Microsoft Publisher aesthetics), generic SaaS landing pages (gradient hero blobs, floating card shadows, Lottie animations, Inter-font-everything), and anything that reads as elitist or price-hiding.

**Key Characteristics:**
- Two-surface logic: dark cockpit (navy) and light documentation (blue-white)
- Typography pairing: Newsreader serif for display authority, Manrope sans for operational clarity
- One signal color (runway amber) — used sparingly on primary CTAs only
- Depth via tonal layering (6-step navy scale) over hard shadows
- Labels are always uppercase, widely tracked, small — aviation-instrument scale
- The booking system and portal are the brand: design both surfaces to the same standard

## 2. Colors: The Two-Surface Palette

A cool-dominant system with one warm signal. No pastels, no gradients for decoration. Color carries structural meaning: depth = darkness, importance = amber, interaction = sky blue.

### Primary
- **Midnight Apron** (#00132f): The deepest base. Used as the background for the marketing hero, overlays, and as the foundation behind the portal shell. Named for the darkest part of a night-time apron.
- **Clear-Sky Blue** (#a7c8ff): The primary interactive accent. Focus rings, active states, link text on dark surfaces, CTA gradients in auth flows. Cool, high-altitude, calm.
- **Runway Amber** (#f59e0b): The sole warm accent. Reserved exclusively for the primary booking CTA on marketing pages and footer hover states. Its absence is as important as its presence.

### Neutral (Dark Surface Stack)
The product shell uses a 6-step navy tonal ramp to create depth without shadows:
- **Night Hangar** (#000e25): Alternate darkest layer; used behind content sections that need to read deeper than the main base.
- **Service Bay** (#051b39): Mid-dark panel background.
- **Ops Panel** (#0a1f3d): Standard content panel background — most dashboard surfaces.
- **Instrument Surround** (#162a48): Elevated cards, hover states, active row highlights.
- **Control Header** (#223554): Topmost tonal layer — top navigation bars, active tab backgrounds.

### Neutral (Light Surface)
- **Open Ceiling** (#dce8f8): The marketing content background, with a 20px dot-grid overlay (`rgba(26,79,214,0.10)`) that adds texture without competing with content.
- **Overcast** (#edf4fc): Alternating section background for light zones.
- **Cloud White** (#ffffff): Card lift — any contained component on the light surface.
- **Horizon Border** (#dbeafe): Subtle border on light-surface cards; default divider.
- **Weather Line** (#bfdbfe): Strong border variant, used for active/focus states on the light surface.

### Neutral (Text)
- **Sky Text** (#d6e3ff): Primary body text on dark surfaces.
- **Cloud Muted** (#c4c6ce): Secondary / muted text on dark.
- **Smoke** (#8e9098): Tertiary / placeholder text on dark.
- **Deep Ink** (#0d1b3e): Primary body text on light surfaces. Same hue family as the dark surface base — the system reads as one palette in two registers.

### Named Rules

**The Amber Scarcity Rule.** Runway amber (#f59e0b) appears on at most one element per screen. It is a signal, not a theme color. Never use it for decorative highlights, section accents, or icon fills.

**The One-Palette Rule.** Both surfaces draw from the same color family (navy-blue). The light surface is not a separate brand — it's the same brand in daylight. Deep Ink (#0d1b3e) is Midnight Apron with the contrast flipped.

## 3. Typography: Editorial Authority Meets Operational Clarity

**Display Font:** Newsreader (Georgia, serif)
**Body / UI Font:** Manrope (system-ui, sans-serif)

**Character:** Newsreader carries weight without weight — a low-key editorial serif that reads as considered and trustworthy at large sizes without tipping into luxury or stuffy formality. Manrope is the instrument panel: neutral, even, precise at every size. Together they signal "this product was built by people who know what they're doing."

### Hierarchy

- **Display** (Newsreader, 400, `clamp(2.25rem, 5vw, 4.5rem)`, leading 1.04, tracking 0.015em): Hero headings only. The marketing hero `<h1>`. Used at `text-4xl md:text-7xl` in practice. Allow italic variants for emphasis phrases within display headings.
- **Headline** (Newsreader, 400, `clamp(1.625rem, 3vw, 2.5rem)`, leading 1.15): Section `<h2>` on both light and dark surfaces. Sections like "How It Works," "Aircraft Specifications," "Pricing."
- **Title** (Manrope, 700, 1.0625rem / 17px, leading 1.3): Card headings, sidebar section labels, dashboard panel titles.
- **Body** (Manrope, 400, 0.9375rem / 15px, leading 1.6): All paragraph copy. Marketing descriptions, FAQ answers, portal content. Max line length 65ch.
- **Label** (Manrope, 700, 0.625rem / 10px, tracking 0.15em, UPPERCASE): Button text, chip text, nav CTA text, status badges, spec table labels. The all-caps + wide tracking is non-negotiable — it is the visual language of aviation instruments.

### Named Rules

**The Uppercase Label Rule.** Any text that labels an action, status, or specification field is uppercase Manrope with at least 0.14em tracking. Never write a CTA in title case using a serif. Labels are instruments, not headlines.

**The Serif-for-Authority Rule.** Newsreader is used only for Display and Headline levels — the places where the brand is asserting something. Do not use Newsreader for body, labels, navigation, or form elements. Mixing registers at small sizes degrades both fonts.

## 4. Elevation

This system is tonal-first. Depth is expressed by stepping up the navy color ramp (Midnight Apron → Control Header), not by stacking shadows. The dark surface has six tonal levels; a panel appears "above" another because its background is a step lighter, not because it casts a shadow.

Shadows exist but play a secondary, atmospheric role:

### Shadow Vocabulary

- **Ambient Glow** (`0 0 0 1px rgba(167,200,255,0.09), 0 0 22px 3px rgba(167,200,255,0.05)`): Resting state for interactive dark-surface cards. The blue halo is barely perceptible — it reinforces that the element is interactive without adding weight.
- **Active Glow** (`0 0 0 1px rgba(167,200,255,0.20), 0 0 36px 8px rgba(167,200,255,0.10)`): Hover/focus state amplification of the ambient glow.
- **Deep Drop** (`0 24px 64px -16px rgba(0,0,0,0.52)`): Structural shadow for elevated overlays (dropdowns, popovers, dark cards on a light surface).
- **Modal Anchor** (`0 40px 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.10)`): Login modal and full-screen dialogs. The inset 1px rule adds a subtle highlight along the top edge — makes glass panels read as having thickness.
- **Admin Panel** (`0 14px 30px rgba(3,8,16,0.38)`): Admin/portal panel cards.

On the light marketing surface, shadows are avoided in favour of borders. Cards lift via background color (`cloud-white` on `open-ceiling`) and a `horizon-border` outline.

### Named Rules

**The Tonal-First Rule.** Add a tonal step before adding a shadow. If depth can be expressed by moving a panel from `ops-panel` to `instrument-surround`, do that. Shadows amplify; they don't replace structure.

**The Glow-Not-Drop Rule.** On dark surfaces, elevation reads as a blue atmospheric glow, not a downward-cast shadow. Hard shadows on dark navy backgrounds feel wrong — they import a convention from light-UI design systems where it doesn't belong.

## 5. Components

### Buttons

Buttons are always uppercase Manrope with wide tracking — no exceptions. The pill shape and the squared shape coexist in the system: the pill is for low-stakes flows (nav, auth, ghost), the rounded-md is for primary revenue CTAs (booking, pricing).

- **Shape (Primary CTA):** Gently squared corners (8px radius). Proportionally heavier than a pill — signals a commitment, not a tap.
- **Primary (Marketing):** `bg-[#f59e0b]` / `text-[#0d1b3e]` / `rounded-md` / `px-8 py-4` / `text-[0.79rem] font-bold uppercase tracking-[0.15em]`. Hover: `bg-[#fbbf24]`.
- **Nav CTA:** `bg-blue-600` / `text-white` / `rounded-full` / `px-5 py-2` / `text-[13px] font-semibold`. Hover: `bg-blue-500` with `shadow-[0_0_15px_rgba(37,99,235,0.4)]`.
- **Auth Submit (Dark surface):** Gradient `from-[#a7c8ff] to-[#608bca]` / `text-[#00132f]` / `rounded-full` / `px-8 py-3.5` / label type. Hover: `scale-[1.02]` + deepened shadow.
- **Ghost:** `border border-oz-blue/40` / `bg-oz-blue/[0.10]` / `text-oz-blue` / `rounded-full`. Hover: `bg-oz-blue/[0.16]`.

### Cards / Containers

Two canonical card treatments matching the two surfaces:

- **Light Card:** `bg-white` / `border border-[#dbeafe]` / `rounded-lg` (12px) / `p-8`. Hover border: `border-[#a7c8ff]/30`. No shadow — lift is achieved by white-on-dce8f8 contrast alone.
- **Dark Card:** `bg-[#0a1f3d]` / `border border-white/10` / `rounded-xl` (16px) / `p-6`. Hover: ambient glow applied.
- **Glass Card (auth/modal):** `bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent` / `border border-white/[0.12]` / `rounded-[24px]` / `shadow-[0_12px_48px_rgba(8,16,30,0.45)]`.

**Internal Padding:** 32px (marketing cards), 24px (product cards), 16px (tight/inline).

### Inputs / Fields

- **Style:** `bg-white/[0.09]` / `border border-white/30` / `rounded-xl` (16px) / `px-3.5 py-3.5`. Borderless at rest; stroke becomes the focus indicator.
- **Focus:** `border-[#a7c8ff]` / `bg-white/[0.13]`. No glowing ring — a clean border shift.
- **Placeholder:** `text-white/50`.
- **Disabled:** `opacity-60 cursor-not-allowed`.
- **Password:** `font-mono` for the value field.

### Navigation (Marketing)

- **Container:** Full-width, `h-[84px]`, `bg-[#0d1b3e]/98 backdrop-blur-xl`, `border-b border-white/[0.08]`. Max content width 1400px, `px-6 md:px-10`.
- **Nav Links:** Manrope, 13.5px, medium weight. Default: `text-white/75`. Active/hover: `text-white`. No underline — color shift only.
- **Dropdown Panel:** `bg-[#0d1e34]` / `border border-white/[0.08]` / `rounded-xl` / `shadow-2xl shadow-black/50` / `backdrop-blur-xl`.
- **CTA Button:** Nav CTA pill (see Buttons). Authenticated state shows a different CTA label but same shape.

### Chips / Badges

- **Pill Chip:** `rounded-full border` / `px-3.5 py-1.5` / `text-[0.62rem] font-semibold uppercase tracking-[0.14em]`. Color varies by role: amber-bordered for pricing/featured, blue-bordered for status.
- **Status Indicator Dot:** `h-1.5 w-1.5 rounded-full` inline before label text. Amber = featured/active pricing tier; no fill = standard.

### Signature Component: Booking CTA Block

The primary conversion unit on pricing pages. Structure: a dark navy container (`rounded-2xl bg-[#0d1b3e] shadow-[0_26px_70px_rgba(0,0,0,0.45)]`) with a blue-tinted header band (`bg-[#1a4fd6]/30`) carrying the tier label, a price display, and the amber CTA button below. The amber button is the only warm element on the entire page.

## 6. Do's and Don'ts

### Do:
- **Do** use Runway Amber (#f59e0b) exclusively for the primary booking/pricing CTA. One instance per screen.
- **Do** express depth on dark surfaces by moving a panel up the navy tonal ramp (ops-panel → instrument-surround) before reaching for a shadow.
- **Do** write all button labels, chip labels, and spec-table headers in uppercase Manrope with at least 0.14em tracking.
- **Do** use Newsreader only for Display (hero h1) and Headline (section h2) levels. All UI text, labels, nav, and form content uses Manrope.
- **Do** pair the dot-grid overlay with the open-ceiling background on all marketing content zones — it adds tactile texture and distinguishes content sections from hero overlays.
- **Do** apply the ambient blue glow (`0 0 0 1px rgba(167,200,255,0.09), 0 0 22px 3px rgba(167,200,255,0.05)`) on dark-surface interactive cards at rest, and amplify it on hover.
- **Do** keep GSAP scroll choreography and Framer Motion entrance animations to the marketing hero only. The customer portal and booking flow use state transitions only.
- **Do** anchor every italic serif usage to a meaningful phrase within a display heading. Italic body text is not part of this system.
- **Do** use the footer hover amber (#E0B13B or #f59e0b) as the one interactive signal in the footer — all links shift to amber on hover, reinforcing the signal-only role of the color.

### Don't:
- **Don't** use clip-art aircraft illustrations, stock photo montages, or 2010-era layout conventions. This is not a legacy flight school website.
- **Don't** use gradient hero blobs, floating card shadows on colored backgrounds, Lottie animations, or the Inter-font SaaS startup aesthetic.
- **Don't** apply Runway Amber as a decorative section accent, icon fill, or hover highlight on standard navigation. Its rarity is its meaning — diluting it destroys the signal.
- **Don't** introduce hard `box-shadow` on dark-surface cards where a tonal step-up would achieve the same depth. If it looks like a 2014 light-theme UI shadow, it's wrong for this surface.
- **Don't** write CTA text in title case or sentence case. Booking actions (`BOOK NOW`, `GET STARTED`, `SIGN IN`) are always uppercase label type. Mixed-case on a CTA reads as informal and undercuts the operational confidence register.
- **Don't** use Newsreader for navigation, form labels, body copy, or any text under 18px. At small sizes it collapses into generic serif noise.
- **Don't** show pricing or eligibility behind a "contact us for rates" gate. Transparent pricing at every touchpoint is a strategic principle from PRODUCT.md — hiding it is a design failure, not a CTA strategy.
- **Don't** add choreographed motion to the customer portal or booking flow. Motion in task-completion flows adds anxiety, not delight.
- **Don't** use more than two typefaces in this system. Newsreader + Manrope is the complete pairing.
- **Don't** use purple, teal, orange, or any hue outside the navy-to-sky-blue axis as an accent. The amber is the one departure from this rule and it is a named exception.
