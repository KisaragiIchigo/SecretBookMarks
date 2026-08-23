/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#04070d',
          900: '#070b14',
          850: '#0b1120',
          800: '#111a2b',
          700: '#1a2438',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', '"IBM Plex Sans JP"', 'sans-serif'],
        sans: ['"IBM Plex Sans JP"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"IBM Plex Sans JP"', 'monospace'],
      },
      // すべて clamp() でウィンドウ幅に滑らかに追従させる（最小は 12px 相当を下回らせない）
      fontSize: {
        xs: ['clamp(0.75rem, 0.727rem + 0.11vw, 0.8125rem)', { lineHeight: '1.5' }],
        sm: ['clamp(0.8125rem, 0.784rem + 0.14vw, 0.875rem)', { lineHeight: '1.55' }],
        base: ['clamp(0.875rem, 0.847rem + 0.14vw, 0.9375rem)', { lineHeight: '1.6' }],
        lg: ['clamp(1rem, 0.943rem + 0.28vw, 1.125rem)', { lineHeight: '1.45' }],
        xl: ['clamp(1.125rem, 1.011rem + 0.57vw, 1.375rem)', { lineHeight: '1.3' }],
        '2xl': ['clamp(1.375rem, 1.148rem + 1.14vw, 1.875rem)', { lineHeight: '1.2' }],
      },
      boxShadow: {
        glow: '0 0 15px rgba(20,184,166,0.2)',
        'glow-strong': '0 0 24px rgba(20,184,166,0.28)',
        inset: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        panel: '0 18px 40px -20px rgba(0,0,0,0.85)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translate(-50%, -48%) scale(0.97)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
}
