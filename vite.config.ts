import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Which app to build (lib/edition, claude-project/SPLIT_PLAN.md):
  // `vite build --mode contractor` / `--mode enfact`, or VITE_EDITION.
  // EnFact unless told otherwise; the store builds always say.
  const edition = mode === "contractor" || mode === "enfact" ? mode : (process.env.VITE_EDITION ?? "enfact");
  if (edition !== "enfact" && edition !== "contractor") throw new Error(`VITE_EDITION is "${edition}": it must be enfact or contractor`);
  return {
    plugins: [react()],
    resolve: {
      // EnFact's artwork, or none in the Contractor build (edition/art.ts)
      alias: { "virtual:edition-art": path.resolve(__dirname, `src/edition/${edition}.ts`) },
    },
    // the Excel export's company template (inlined into the export chunk)
    assetsInclude: ["**/*.xlsx"],
    define: {
      __EDITION__: JSON.stringify(edition),
      // the branch a GitHub Actions build was made from (empty for local
      // builds), so builds from anything but main say "Test version" (lib/buildInfo)
      __BUILD_BRANCH__: JSON.stringify(process.env.GITHUB_REF_NAME ?? ""),
    },
    server: {
      host: true,
    },
  };
});
