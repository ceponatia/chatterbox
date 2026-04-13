import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import rootConfig from "../../eslint.config.mjs";

const eslintConfig = defineConfig([
  ...rootConfig,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
