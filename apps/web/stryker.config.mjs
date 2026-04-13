/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  mutate: [
    "src/lib/state-pipeline/**/*.ts",
    "!src/lib/state-pipeline/__tests__/**",
  ],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  thresholds: { high: 80, low: 60, break: null },
  vitest: { configFile: "vitest.config.ts" },
};