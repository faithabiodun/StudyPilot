/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        pilot: {
          blue: "#2563EB",
          deep: "#0F172A",
          sky: "#EFF6FF",
          light: "#DBEAFE",
          ice: "#F8FBFF",
          card: "#FFFFFF",
          ink: "#0F172A",
          muted: "#64748B",
          line: "#E2E8F0",
          soft: "#EFF6FF",
          green: "#18A66A",
          violet: "#7A5CFF",
          amber: "#F59E0B"
        }
      },
      boxShadow: {
        pilot: "0 24px 70px rgba(37, 99, 235, 0.14)",
        soft: "0 16px 44px rgba(15, 23, 42, 0.08)",
        glow: "0 18px 48px rgba(37, 99, 235, 0.22)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};
