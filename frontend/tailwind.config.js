/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Barlow Condensed"', "sans-serif"],
        body: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      colors: {
        ink: "#09090B",
        paper: "#FFFFFF",
        muted: "#F4F4F5",
        rule: "#A1A1AA",
        safety: "#FBBF24",
        signal: "#DC2626",
      },
      boxShadow: {
        hard: "4px 4px 0px 0px rgba(9,9,11,1)",
        hardsm: "2px 2px 0px 0px rgba(9,9,11,1)",
      },
      borderRadius: {
        none: "0",
      },
    },
  },
  plugins: [],
};
