import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [".next/**", "coverage/**", "playwright-report/**", "test-results/**", "public/data/**", ".cache/**"],
  },
];

export default config;
