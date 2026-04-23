import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18202a",
        road: "#30343b",
        signal: "#e5b343",
        brake: "#c94b4b",
        mile: "#2f7d6d",
        mist: "#f4f6f8"
      }
    }
  },
  plugins: []
};

export default config;
