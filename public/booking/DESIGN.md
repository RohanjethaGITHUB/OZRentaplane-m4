---
name: Aero Elite Narrative
colors:
  surface: '#11131b'
  surface-dim: '#11131b'
  surface-bright: '#373942'
  surface-container-lowest: '#0c0e16'
  surface-container-low: '#191b23'
  surface-container: '#1d1f27'
  surface-container-high: '#282a32'
  surface-container-highest: '#32343d'
  on-surface: '#e1e2ed'
  on-surface-variant: '#c3c6d7'
  inverse-surface: '#e1e2ed'
  inverse-on-surface: '#2e3039'
  outline: '#8d90a0'
  outline-variant: '#434655'
  surface-tint: '#b4c5ff'
  primary: '#b4c5ff'
  on-primary: '#002a78'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#0053db'
  secondary: '#b7c8e1'
  on-secondary: '#213145'
  secondary-container: '#3a4a5f'
  on-secondary-container: '#a9bad3'
  tertiary: '#ffb596'
  on-tertiary: '#581e00'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#d3e4fe'
  secondary-fixed-dim: '#b7c8e1'
  on-secondary-fixed: '#0b1c30'
  on-secondary-fixed-variant: '#38485d'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#11131b'
  on-background: '#e1e2ed'
  surface-variant: '#32343d'
typography:
  display-serif:
    fontFamily: notoSerif
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  section-heading:
    fontFamily: notoSerif
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-ui:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  data-tabular:
    fontFamily: inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.01em
  label-caps:
    fontFamily: inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin: 24px
---

## Brand & Style

The design system is engineered for high-stakes aviation environments where operational precision meets executive exclusivity. The brand personality is **Trustworthy, Operational, Sophisticated, and Exclusive**, evoking the atmosphere of a private flight operations center.

The design style is a hybrid of **Corporate Modern** and **Glassmorphism**, utilizing deep tonal layering to manage complex data density without overwhelming the user. It prioritizes clarity through high-contrast labeling and subtle depth, ensuring that critical flight information is immediately actionable while maintaining a "private club" aesthetic through refined serif accents.

## Colors

The palette is anchored in deep oceanic tones to reduce eye strain during long operational shifts. 

- **Primary Canvas**: The core background uses `#0A0E14`, while elevated cards and sidebars use `#0F172A` to create structural separation.
- **Action & Focus**: Cobalt Blue (`#2563EB`) is reserved strictly for primary actions, active navigation states, and interactive toggles.
- **Functional Accents**: A high-intent semantic system is employed:
    - **Emerald Green**: Signifies high availability and "Go" status.
    - **Amber**: Indicates warnings, maintenance requirements, or suspended flight plans.
    - **Crimson**: Used exclusively for airspace conflicts or immediate grounding events.
- **Neutral Framework**: Slate grays are used for borders (`#1E293B`) and secondary metadata (`#64748B`) to keep the interface recessive relative to data points.

## Typography

This design system utilizes a dual-typeface strategy to balance operational utility with luxury branding.

- **Headlines (Noto Serif)**: Used for page titles and major section headers. This introduces a literary, authoritative tone that differentiates the dashboard from standard SaaS products.
- **UI & Data (Inter)**: The workhorse font for all functional elements. Inter is chosen for its exceptional legibility in small sizes and its neutral, technical appearance.
- **Key Treatment**: Use Uppercase Label styles for metadata headers to maximize vertical space and improve scanning speed in data-heavy tables.

## Layout & Spacing

The system follows a **Fixed Grid** model for main dashboard views to ensure predictable data positioning, transitioning to a **Fluid Grid** for secondary management screens. 

- **Grid System**: A 12-column grid with a 20px gutter. 
- **Rhythm**: A 4px baseline grid governs all internal component spacing.
- **Information Density**: High. Elements are packed efficiently but separated by subtle 1px slate borders rather than large gaps of whitespace to maintain the "cockpit" feel where all controls are within reach.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Soft Shadows** rather than extreme color shifts.

- **Z-Index 0**: `#0A0E14` (The abyss/base layer).
- **Z-Index 1**: `#0F172A` (Standard cards/containers). These feature a 1px border of `#1E293B`.
- **Z-Index 2**: Modals and pop-overs use a slightly lighter slate background with a soft, 20% opacity black shadow (0px 10px 30px) to simulate floating over the dashboard.
- **Glass Effect**: Navigation sidebars may use a 10px backdrop blur with 80% opacity on the `#0F172A` fill to add a sense of modern material depth.

## Shapes

The shape language is **Soft** and disciplined. A standard radius of 4px (`rounded-sm`) is applied to most UI components like inputs and buttons to maintain a professional, precision-engineered look. 

Larger containers and cards use 8px (`rounded-lg`) to provide a subtle visual softening that prevents the dark UI from feeling too aggressive or "brutalist." Status indicators (pills) are the only elements allowed to use a full 100px radius for immediate shape-based recognition.

## Components

- **Buttons**: Primary buttons use a solid Cobalt Blue. Secondary buttons are ghost-style with a Slate Gray border and white text. All buttons feature a subtle 1px inner light-stroke on the top edge to simulate a tactile "bezel" effect.
- **Status Chips**: Use a "Glow" style. Backgrounds are 15% opacity of the status color (Emerald/Amber/Crimson) with a solid 1px border of the same color and high-contrast white text.
- **Data Cards**: Structured with a Noto Serif header, followed by a 1px horizontal separator, then Inter-based data rows.
- **Input Fields**: Darker than the card surface (`#0A0E14`) with a 1px border. The focus state is a 1px Cobalt Blue border with a soft blue outer glow.
- **Flight Trackers**: Horizontal timeline components using thin slate lines and status-colored nodes to represent flight progress and potential conflict windows.
- **Tab Nav**: Underline style for secondary navigation; segmented "pill" toggle for view-switching within cards.