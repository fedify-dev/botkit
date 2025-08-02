import deno from "../packages/botkit/deno.json" with { type: "json" };
import pkg from "../packages/botkit/package.json" with { type: "json" };

if (deno.version !== pkg.version) {
  console.error(
    `Version mismatch: deno.json version ${deno.version} does not match package.json version ${pkg.version}.`,
  );
  Deno.exit(1);
}
