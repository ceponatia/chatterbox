import { defineConfig, globalIgnores } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";

// ---------------------------------------------------------------------------
// Root ESLint config — boundary enforcement + shared rules.
// App-specific rules (Next.js, React) live in apps/web/eslint.config.mjs.
// ---------------------------------------------------------------------------

const eslintConfig = defineConfig([
  // ----- Global ignores -----
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/next-env.d.ts",
  ]),

  // ----- Boundary enforcement (all packages) -----
  {
    plugins: { boundaries },
    settings: {
      // Define the architectural elements by filesystem pattern
      "boundaries/elements": [
        { type: "app", pattern: ["apps/*"], capture: ["app"] },
        { type: "sockets", pattern: ["packages/sockets"] },
        // Future packages register here:
        // { type: "prompt-assembly", pattern: ["packages/prompt-assembly"] },
        // { type: "state-pipeline", pattern: ["packages/state-pipeline"] },
      ],
      "boundaries/dependency-nodes": ["import", "dynamic-import"],
    },
    rules: {
      // ----- Which packages can import which -----
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Apps can import from sockets (and future declared packages)
            { from: "app", allow: ["sockets"] },
            // Sockets is a leaf — it cannot import from any other package
            { from: "sockets", allow: [] },
          ],
        },
      ],

      // ----- No reaching into package internals -----
      "boundaries/no-private": ["error"],
    },
  },

  // ----- Shared code quality rules (apply to all packages) -----
  {
    rules: {
      complexity: ["warn", { max: 10 }],
      "max-lines-per-function": [
        "warn",
        { max: 100, skipBlankLines: true, skipComments: true },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/src/*"],
              message: "Do not reach into another package's src/. Import from the package root.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
