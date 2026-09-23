import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "au.com.inspecta.app",
  appName: "Inspecta",
  webDir: "dist",
  // matches --bg in src/index.css, so there's no flash of a different dark
  // shade between the native splash, the WebView's own background, and the
  // app's first paint
  backgroundColor: "#071b2c",
  android: {
    backgroundColor: "#071b2c",
  },
};

export default config;
