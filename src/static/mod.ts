import { Embeds } from "jsr:@smallweb/embed@0.0.15/embed";

const embeds = new Embeds({
  "pico.amber.min.css": () => import("./_pico.amber.min.css.ts"),
  "pico.azure.min.css": () => import("./_pico.azure.min.css.ts"),
  "pico.blue.min.css": () => import("./_pico.blue.min.css.ts"),
  "pico.cyan.min.css": () => import("./_pico.cyan.min.css.ts"),
  "pico.fuchsia.min.css": () => import("./_pico.fuchsia.min.css.ts"),
  "pico.green.min.css": () => import("./_pico.green.min.css.ts"),
  "pico.grey.min.css": () => import("./_pico.grey.min.css.ts"),
  "pico.indigo.min.css": () => import("./_pico.indigo.min.css.ts"),
  "pico.jade.min.css": () => import("./_pico.jade.min.css.ts"),
  "pico.lime.min.css": () => import("./_pico.lime.min.css.ts"),
  "pico.orange.min.css": () => import("./_pico.orange.min.css.ts"),
  "pico.pink.min.css": () => import("./_pico.pink.min.css.ts"),
  "pico.pumpkin.min.css": () => import("./_pico.pumpkin.min.css.ts"),
  "pico.purple.min.css": () => import("./_pico.purple.min.css.ts"),
  "pico.red.min.css": () => import("./_pico.red.min.css.ts"),
  "pico.sand.min.css": () => import("./_pico.sand.min.css.ts"),
  "pico.slate.min.css": () => import("./_pico.slate.min.css.ts"),
  "pico.violet.min.css": () => import("./_pico.violet.min.css.ts"),
  "pico.yellow.min.css": () => import("./_pico.yellow.min.css.ts"),
  "pico.zinc.min.css": () => import("./_pico.zinc.min.css.ts"),
});

export default embeds;