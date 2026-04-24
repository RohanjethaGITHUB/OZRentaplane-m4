---
name: Aviation Excellence
colors:
  surface: '#101415'
  surface-dim: '#101415'
  surface-bright: '#363a3b'
  surface-container-lowest: '#0b0f10'
  surface-container-low: '#191c1e'
  surface-container: '#1d2022'
  surface-container-high: '#272a2c'
  surface-container-highest: '#323537'
  on-surface: '#e0e3e5'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e0e3e5'
  inverse-on-surface: '#2d3133'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#bec6e0'
  on-secondary: '#283044'
  secondary-container: '#3f465c'
  on-secondary-container: '#adb4ce'
  tertiary: '#bcc7de'
  on-tertiary: '#263143'
  tertiary-container: '#8691a7'
  on-tertiary-container: '#1f2a3c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#101415'
  on-background: '#e0e3e5'
  surface-variant: '#323537'
typography:
  display-hero:
    fontFamily: notoSerif
    fontSize: 72px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-h1:
    fontFamily: notoSerif
    fontSize: 48px
    fontWeight: '400'
    lineHeight: '1.2'
  headline-h2:
    fontFamily: notoSerif
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.3'
  body-lg:
    fontFamily: inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  section-gap: 120px
  container-max: 1280px
  gutter: 32px
  margin-page: 64px
---

## Brand & Style

The brand personality is defined by "Restrained Luxury"—an aesthetic that prioritizes atmospheric depth and quiet confidence over loud, transactional UI. The target audience consists of high-net-worth individuals who value time, precision, and an elevated travel experience. 

The design style is a hybrid of **Minimalism** and **Cinematic Glassmorphism**. We utilize expansive whitespace (calm spacing) and high-quality editorial layouts to move away from "dashboard" fatigue and toward a "concierge" experience. Key visual motifs include subtle aeronautical textures, such as radial runway glows and route-line overlays, which provide a sense of motion and horizon-inspired depth.

## Colors

The palette is anchored in a dark-mode-first architecture. The base background uses a deep midnight (#0A0E14) to create a sense of infinite space, while elevated surfaces utilize a slightly lighter navy (#0F172A).

- **Primary Accents:** A soft blue glow (#3B82F6) is used sparingly for interactive elements and highlights, simulating the luminescence of cockpit instrumentation.
- **Neutrals:** We avoid pure white for text, opting for refined off-whites (#F8FAFC) and muted grays (#94A3B8) to reduce eye strain and maintain the cinematic atmosphere.
- **Gradients:** Subtle linear gradients (from #0F172A to #1E293B) are applied to cards to suggest physical form without excessive weight.

## Typography

This design system employs a sophisticated typographic hierarchy that balances editorial elegance with functional clarity.

- **Headlines:** `notoSerif` is our primary display face. It provides a timeless, literary quality to hero sections and high-level headings. It should be typeset with generous leading and slightly tightened letter-spacing for large hero titles.
- **Functional Text:** `inter` is utilized for all data-heavy components, body copy, and UI labels. Its neutral, systematic nature ensures that flight data and technical details remain highly legible against atmospheric backgrounds.
- **Micro-copy:** Use the `label-caps` style for small headers or category tags to evoke the technical feel of flight manifests.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model to maintain a controlled, website-like composition. Elements are aligned to a 12-column grid with generous gutters to prevent visual clutter.

- **Vertical Rhythm:** Sections are separated by significant vertical padding (120px) to allow the "Portal Hero Lite" backgrounds to breathe and create a sense of progression as the user scrolls.
- **Alignment:** Content should be centered within a 1280px container, creating a stable focal point that feels more like a curated luxury magazine than a standard software dashboard.
- **Internal Spacing:** Components use a strict 8px-based scale, favoring "airy" internal padding to maintain the feeling of restrained luxury.

## Elevation & Depth

Visual depth is achieved through **Tonal Layering** and **Atmospheric Vignettes** rather than traditional drop shadows.

- **Layers:** The base layer is the midnight #0A0E14. Content cards sit on the first elevation tier using #0F172A. 
- **Backdrop Effects:** Use soft radial glows in the primary blue (#3B82F6 at 10-20% opacity) behind key cards or hero elements to create a "halo" effect.
- **Vignettes:** Page edges should feature a subtle gradient vignette that pulls the user's eye toward the center of the screen, reinforcing the cinematic feel.
- **Borders:** Surfaces should use thin (1px), low-opacity borders (White at 10% opacity) to define shapes without breaking the dark atmospheric flow.

## Shapes

The shape language is characterized by **Soft Precision**. We utilize a 0.25rem (4px) base radius for standard elements to mirror the high-precision engineering of modern aircraft.

- **Small Components:** Buttons and input fields use a consistent 4px radius.
- **Large Components:** Hero images and containers use `rounded-lg` (8px) or `rounded-xl` (12px) to provide a gentle, sophisticated frame for atmospheric content.
- **Visual Texture:** Backgrounds incorporate thin, geometric "route lines" (linear paths with 1px weight) that intersect at 45 or 90-degree angles to provide a subtle technical texture to the organic gradients.

## Components

### Portal Hero Lite
The signature pattern for this system. It consists of a large-scale serif headline over a background featuring a faint aircraft silhouette or runway perspective lines. A soft radial glow (#3B82F6 at 15%) should be centered behind the main call-to-action.

### Buttons
- **Primary:** Solid #3B82F6 with white text, using a subtle outer glow on hover.
- **Secondary:** Transparent background with a thin 1px white-alpha border.
- **Text:** All-caps labels with 0.1em letter spacing.

### Cards
Cards are the primary container for flight options and member data. They should feature:
- A background gradient from #0F172A to #1E293B.
- A 1px top-border highlight (white at 15%) to catch the "light."
- No external shadows; depth is managed via background contrast.

### Inputs & Selection
- **Inputs:** Minimalist bottom-border style or fully enclosed with a very dark fill (#05080A). 
- **Active State:** The bottom border transforms into a primary blue (#3B82F6) glow.
- **Chips:** Small, pill-shaped indicators for status (e.g., "Confirmed", "In-Flight") using low-saturation background tints.

### Aviation Textures
Integrate "Route Lines"—thin, dashed lines connecting points—within the background of lists or cards to reinforce the aviation theme. These should be treated at 5-10% opacity to remain secondary to content.