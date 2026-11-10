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
  // iPhone: the keyboard shrinks the screen (as on Android) rather than
  // sliding the page about; lib/keepFocusedVisible then keeps the field in view
  ios: {
    scrollEnabled: false,
  },
  plugins: {
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
