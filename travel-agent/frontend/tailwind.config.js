/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        headline: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#0a47ee",
          container: "#3e65ff",
          fixed: "#dde1ff",
        },
        "primary-fixed": "#dde1ff",
        secondary: { DEFAULT: "#4648d4" },
        surface: {
          DEFAULT: "#f7f9fb",
          low: "#f2f4f6",
          lowest: "#ffffff",
          high: "#e6e8ea",
          highest: "#e0e3e5",
          container: "#eceef0",
        },
        ink: "#191c1e",
        muted: "#414754",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "2rem",
        "3xl": "3rem",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 38, 135, 0.07)",
        lift: "0 4px 24px rgba(0, 0, 0, 0.02)",
        primary: "0 8px 24px rgba(10, 71, 238, 0.2)",
      },
    },
  },
  plugins: [],
};
