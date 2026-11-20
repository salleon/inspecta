import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The Contractor app's own icons (favicon, home-screen icons) in place of
// public/'s, which are EnFact's. Both made by scripts/render-icons.mjs.
function contractorIcons(): Plugin {
  const dir = path.resolve(__dirname, "branding/icons/contractor/web");
  const names = readdirSync(dir);
  return {
    name: "contractor-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].slice(1);
        if (!name || !names.includes(name)) return next();
        res.setHeader("Content-Type", name.endsWith(".svg") ? "image/svg+xml" : "image/png");
        res.end(readFileSync(path.join(dir, name)));
      });
    },
    // after the build has copied public/ into the output folder
    writeBundle(options) {
      for (const name of names) copyFileSync(path.join(dir, name), path.join(options.dir!, name));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Which app to build (lib/edition, claude-project/SPLIT_PLAN.md):
  // `vite build --mode contractor` / `--mode enfact`, or VITE_EDITION.
  // EnFact unless told otherwise; the store builds always say.
  const edition = mode === "contractor" || mode === "enfact" ? mode : (process.env.VITE_EDITION ?? "enfact");
  if (edition !== "enfact" && edition !== "contractor") throw new Error(`VITE_EDITION is "${edition}": it must be enfact or contractor`);
  // each app's own build label, shown in Settings (BUILD_LABEL_ENFACT /
  // BUILD_LABEL_CONTRACTOR, also its Android and iPhone version)
  const buildLabel = readFileSync(path.resolve(__dirname, `BUILD_LABEL_${edition.toUpperCase()}`), "utf8").trim();
  return {
    plugins: [react(), ...(edition === "contractor" ? [contractorIcons()] : [])],
    resolve: {
      // EnFact's artwork, or none in the Contractor build (edition/art.ts)
      alias: { "virtual:edition-art": path.resolve(__dirname, `src/edition/${edition}.ts`) },
    },
    // the Excel export's company template (inlined into the export chunk)
    assetsInclude: ["**/*.xlsx"],
    define: {
      __EDITION__: JSON.stringify(edition),
      __BUILD_LABEL__: JSON.stringify(buildLabel),
      // the branch a GitHub Actions build was made from (empty for local
      // builds), so builds from anything but main say "Test version" (lib/buildInfo)
      __BUILD_BRANCH__: JSON.stringify(process.env.GITHUB_REF_NAME ?? ""),
    },
    server: {
      host: true,
    },
  };
});
