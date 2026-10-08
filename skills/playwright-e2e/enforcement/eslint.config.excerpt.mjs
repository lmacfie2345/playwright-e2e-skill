// playwright-e2e skill: ESLint flat-config block for Playwright end-to-end tests (TypeScript).
// Merge this object into the repository's eslint.config.mjs; adjust `files` to where the suite lives.
// Needs: npm i -D eslint eslint-plugin-playwright typescript-eslint
//
// If the repository already registers @typescript-eslint (for example through eslint-config-next or
// typescript-eslint's own configs), keep only `languageOptions.parserOptions` and `rules` from the TypeScript
// part below: registering the plugin twice is an error.
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

const pw = playwright.configs["flat/recommended"];

export const playwrightE2e = {
  files: ["tests/e2e/**/*.ts"],
  plugins: { ...pw.plugins, "@typescript-eslint": tseslint.plugin },
  languageOptions: {
    ...pw.languageOptions,
    parser: tseslint.parser,
    // Type information, so floating promises (an un-awaited action or assertion) are caught.
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    ...pw.rules,
    "playwright/no-wait-for-timeout": "error", // rule 11
    "playwright/no-force-option": "error", // rule 11
    "playwright/no-conditional-in-test": "error", // rule 11
    "playwright/prefer-web-first-assertions": "error", // rule 2
    "playwright/missing-playwright-await": "error",
    "playwright/no-skipped-test": "error",
    "playwright/no-focused-test": "error",
    // Helpers that assert internally count as assertions; list yours here.
    "playwright/expect-expect": ["warn", { assertFunctionNames: ["signInViaApi"] }],
    "@typescript-eslint/no-floating-promises": "error",
    // React projects only: React's hooks rule mistakes Playwright's fixture callback `use` for React's use().
    // "react-hooks/rules-of-hooks": "off",
  },
};

// Usage in eslint.config.mjs:
//   import { playwrightE2e } from "./eslint.playwright.mjs";
//   export default [...yourExistingConfig, playwrightE2e];
