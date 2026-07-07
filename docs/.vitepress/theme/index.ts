// https://vitepress.dev/guide/custom-theme
import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import "@shikijs/vitepress-twoslash/style.css";
import "virtual:group-icons.css";
import type { EnhanceAppContext, Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import BotKitLanding from "./components/BotKitLanding.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // The custom landing renders inside the full-width `.VPHome` container,
      // keeping the default top nav and footer.
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      "home-hero-before": () => h(BotKitLanding),
    });
  },
  enhanceApp({ app, router, siteData }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
  },
} satisfies Theme;
