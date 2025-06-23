import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/**/*.ts",
    "src/**/*.tsx",
  ],
  dts: {
    sourcemap: true,
  },
  format: "esm",
  platform: "node",
  unbundle: true,
  outputOptions: {
    intro: `
      import { Temporal, toTemporalInstant } from "@js-temporal/polyfill";
      Date.prototype.toTemporalInstant = toTemporalInstant;
    `,
  },
});
