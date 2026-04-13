export default {
  testRunner: "vitest",
  mutate: ["src/**/*.ts", "!src/__tests__/**", "!src/index.ts"],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  thresholds: { high: 80, low: 60, break: null },
};
