import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/mod.ts",
  dts: {
    sourcemap: true,
  },
  format: "esm",
  platform: "node",
  outputOptions: {
    intro: `
      import { Temporal, toTemporalInstant } from "@js-temporal/polyfill";
      Date.prototype.toTemporalInstant = toTemporalInstant;
    `,
  },
});
