import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // M10: the browser calculation may only run inside the voyage context, which
  // decides by CALC_AUTHORITY whether it is displayed, compared or not run at all.
  // Components must not compute results themselves (prevents a second authority
  // from creeping back; stage 5 deletes the calculation per domain).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/context/VoyageContext.tsx", "src/test/**", "src/golden/**", "src/hooks/useVoyageCalculation.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/hooks/useVoyageCalculation",
          importNames: ["useVoyageCalculation", "computeVoyageResults"],
          message: "Read results from useVoyageContext(); only VoyageContext runs the browser calculation (M10, CALC_AUTHORITY).",
        }],
      }],
    },
  },
);
