import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import rootConfig from "../../eslint.config.mjs";

// ---------------------------------------------------------------------------
// App-specific ESLint config — inherits root boundary rules, adds Next.js.
// ---------------------------------------------------------------------------

const eslintConfig = defineConfig([
  // Inherit root config (boundaries, shared quality rules)
  ...rootConfig,

  // Next.js rules
  ...nextVitals,
  ...nextTs,

  // App-specific overrides
  {
    rules: {
      // Allow underscore-prefixed unused vars (common in React/hook patterns)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
