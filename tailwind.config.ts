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
      },
      fontFamily: {
        serif: ['var(--font-noto-serif)', 'Georgia', 'serif'],
        sans:  ['var(--font-manrope)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
