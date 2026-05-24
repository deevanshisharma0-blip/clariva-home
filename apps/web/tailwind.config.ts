import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07070e",
        surface: "#0d0d1a",
        card: "#12121f",
        "card-hover": "#16162a",
        border: "rgba(255,255,255,0.07)",
        "border-strong": "rgba(255,255,255,0.12)",
        primary: "#7c3aed",
        "primary-light": "#8b5cf6",
        "primary-dim": "rgba(124,58,237,0.15)",
        gold: "#f59e0b",
        "gold-dim": "rgba(245,158,11,0.15)",
        success: "#10b981",
        "success-dim": "rgba(16,185,129,0.15)",
        warning: "#f59e0b",
        "warning-dim": "rgba(245,158,11,0.15)",
        danger: "#ef4444",
        "danger-dim": "rgba(239,68,68,0.15)",
        muted: "#64748b",
        "text-primary": "#f1f5f9",
        "text-secondary": "#94a3b8",
        "text-dim": "#475569",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
