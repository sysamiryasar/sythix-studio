import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", ".wrangler", "node_modules", "src/worker/generated", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/client/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "react-hooks/set-state-in-effect": "off", "react-hooks/refs": "off" },
  },
  {
    files: ["src/worker/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs", "*.config.{ts,js}", "e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.worker } },
  },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
);
