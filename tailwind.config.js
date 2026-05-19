/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0C',
        'bg-2': '#0d0d10',
        fg: '#F4F2EC',
        'fg-dim': 'rgba(244,242,236,0.55)',
        'fg-mute': 'rgba(244,242,236,0.32)',
        'fg-faint': 'rgba(244,242,236,0.14)',
        hair: 'rgba(244,242,236,0.08)',
        accent: '#C84B30',
        'accent-dim': 'rgba(200,75,48,0.60)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
