import rootConfig from "../../eslint.config.mjs";
import tseslint from "typescript-eslint";

export default [
  ...rootConfig,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
