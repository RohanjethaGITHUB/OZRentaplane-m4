import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy oz-* aliases (kept for backward compat — portal/admin use these)
        'oz-navy':    '#00132f',
        'oz-deep':    '#000e25',
        'oz-mid':     '#051b39',
        'oz-panel':   '#0a1f3d',
        'oz-high':    '#162a48',
        'oz-highest': '#223554',
        'oz-blue':    '#a7c8ff',
        'oz-blue-dim':'#608bca',
        'oz-text':    '#d6e3ff',
        'oz-muted':   '#c4c6ce',
        'oz-subtle':  '#8e9098',

        // DESIGN.md canonical tokens — dark surface stack
        'midnight-apron':     '#00132f',
        'night-hangar':       '#000e25',
        'service-bay':        '#051b39',
        'ops-panel':          '#0a1f3d',
        'instrument-surround':'#162a48',
        'control-header':     '#223554',

        // DESIGN.md canonical tokens — accents
        'clearsky':           '#a7c8ff',
        'haze-blue':          '#608bca',
        'nav-blue':           '#2563eb',

        // DESIGN.md canonical tokens — marketing light surface
        'open-ceiling':       '#cfe3f5',
        'overcast':           '#e0edf8',
        'pale-air':           '#f4f9fd',  // alt-section bg, one step above overcast
        'cloud-white':        '#ffffff',
        'pale-lift':          '#f9fcff',  // card/lift surfaces — very faint sky tint
        'horizon-border':     '#dbeafe',
        'weather-line':       '#bfdbfe',

        // DESIGN.md canonical tokens — text
        'deep-ink':           '#152d5a',  // marketing headings/labels — was #0d1b3e
        'sky-text':           '#d6e3ff',
        'cloud-muted':        '#c4c6ce',
        'smoke':              '#8e9098',

        // DESIGN.md canonical tokens — signal
        'runway-amber':       '#f59e0b',
        'runway-amber-hot':   '#fbbf24',
        'ember-gold':         '#e0b13b',

        // Extended tokens (high-frequency values found in the codebase)
        'brand-blue':         '#1a4fd6',  // dot-grid overlay + accent highlights
        'muted-ink':          '#4b6390',  // secondary text on dark-blue sections
        'pale-sky':           '#d9e3f6',  // body text on dark-navy backgrounds
        'panel-deep':         '#1b365d',  // hero CTA gradient destination
        'ink-deep':           '#143057',  // text on gradient/colored CTA button surfaces
        'cloud-hover':        '#eef4ff',  // very light blue hover state on light surface
      },
      fontFamily: {
        serif: ['var(--font-newsreader)', 'Georgia', 'serif'],
        sans:  ['var(--font-manrope)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}

export default config
