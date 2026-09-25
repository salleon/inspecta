# Inspecta

A fast, offline-first app for on-site fire safety inspection capture — built to replace the slow multi-tap flow of apps like Site Audit Pro with a camera-first workflow. Ships two ways: as an installable web app (PWA), and as a real Android `.apk`.

## What it does

- **Sites dashboard** — list of sites/inspections, split into AFSS and Project work sections, tap to jump straight into the camera for that site, or start a new one.
- **Camera-first capture** — the shutter is always one tap away. Capturing a photo creates a new finding and drops you straight into a note screen; saving returns you to the camera immediately (no menus, no dashboards in between).
- **Multi-photo findings** — if one angle isn't enough, add extra photos to the finding you're currently on right from the camera screen.
- **Retake / delete** — fix a bad shot without leaving the note screen.
- **Saves straight to your gallery** — on the Android app, every photo is also saved to your phone's normal photo gallery via the native camera, independent of the app.
- **Everything stored offline** — findings, notes, locations and full-resolution photos are saved to the device (IndexedDB) as you go, no signal required. Nothing is lost if you close the app or lose connection.
- **PDF export** — generates a report with every photo (burned-in time/date stamp), location and note, ready to share.
- **Excel export** — fills the company findings-register template (`src/assets/findings-template.xlsx`): one row per finding with location, description, full-resolution stamped photos (5 cm wide), date identified, risk level (colour-filled) and status. Built for desktop Excel.
- **Send Photos Only** — every photo on the site at full camera resolution, with the time/date stamp, in one zip (e.g. `Harbour Tower.zip`) holding a folder named after the site. Files are named `01 - Level 25 - Back of house kitchen.jpg` in the same finding order as the PDF and Excel. Share it to OneDrive, then *Extract All* on the laptop.
- **Location suggestions** — while typing a location, up to 3 buttons suggest locations already used on *this site* (most recent first, filtered as you type). Tap one to fill it in.
- **Advanced controls** — a switch in the settings menu (the gear on the dashboard), on by default. When on, findings get extra optional fields: **Defect type** (Critical / Non-critical / Non-compliance / Recommend / Note only / Rectified, colour-coded) and **Level** (type `25` for "Level 25", quick buttons for Ground / Basement / Mezzanine / Roof, carried over to the next finding) and **ESR category** (below). Anything entered always shows in the app and in exports, even if the switch is later turned off.
- **ESR categories** (Advanced) — each finding can be tagged with an item from the company's ESR list (`src/lib/esrCategories.ts`, e.g. "1.6 Fire Doors"). While the note is typed, the top 5 likely categories are suggested, grouped under their section; they come from built-in keywords plus the words of past picks on that phone (`src/lib/esrSuggest.ts`, offline, no AI service). "Browse all" has the full list with search. Before a PDF or Excel export, uncategorised findings can be categorised one at a time (skip, come back, or skip to export). Reports then group findings under a blue row per section and a grey row per item, similar notes together, with Refs like `1.6.1` (`src/lib/esrGrouping.ts`); Uncategorised goes last. The photos zip isn't grouped.
- **Admin** (Settings → Admin, PIN protected, default `2021`) — tune the ESR keywords on a phone (`src/lib/esrKeywords.ts` stores the changes over the built-in list), test a note's suggestions, share/load keyword files, change the PIN, and email a recovery code for a forgotten PIN (`src/lib/adminPin.ts`). "Forgot PIN?" also takes the owner's master recovery code; only its SHA-256 fingerprint is in the code, so changing it means generating a new code and replacing `MASTER_HASH`.

## Getting the Android APK (recommended for your team)

This repo has a GitHub Actions workflow (`.github/workflows/build-apk.yml`) that builds the `.apk` for you in the cloud — no Android Studio or SDK needed on your end.

1. Create a new **GitHub repository** (free account is fine) and push this folder to it:
   ```bash
   cd inspecta
   git init
   git add .
   git commit -m "Inspecta"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. On GitHub, open the repo's **Actions** tab. The "Build Android APK" workflow runs automatically on that push (takes a few minutes — it's downloading the Android SDK).
3. Once it finishes (green check), click into the run → scroll to **Artifacts** → download `inspecta-release-apk`. Unzip it to get `app-release.apk`. (The workflow signs it with the release key from the repo's Actions secrets, so each build installs as an update over the last.)

   To build a branch other than `main`, open **Actions → Build Android APK → Run workflow** and pick the branch in **"Use workflow from"**.
4. Send that `.apk` file to yourself (email, Slack, Drive — whatever's easiest) and open it **on the Android phone**. Android will ask you to allow installing from this source the first time — approve that, then install.

**Test app:** the same run also produces `inspecta-test-apk` (`app-staging.apk`). It installs as a separate app called "Inspecta Test" (orange icon) with its own data, so you can try out a branch without touching the real Inspecta or its inspections.

That's it — no Play Store, no hosting, just the one file. Whenever you want an updated build, push your changes and re-download the new artifact from Actions.

> A **work/managed Android device** may block installing APKs from outside the Play Store via its MDM policy — if the install is blocked or greyed out, that's an IT/device-policy restriction, not something fixable from this app; check with whoever manages the device policy.

## Running it as a web app instead

You'll need [Node.js](https://nodejs.org) (18+) installed.

```bash
npm install
npm run dev
```

This starts a local dev server (shown in the terminal, usually `http://localhost:5173`). Open that on your phone's browser to try it — camera access needs a secure context (`https://` or `localhost`), so on a plain `http://` LAN address most mobile browsers will block the camera prompt. Easiest fixes: deploy it (see below) for a real `https://` URL, or use [ngrok](https://ngrok.com) (`ngrok http 5173`) for a temporary one.

Once open over HTTPS, "Add to Home Screen" (iPhone Safari share icon, or Android Chrome's ⋮ menu) installs it full-screen like an app, and it keeps working offline afterwards.

### Deploying the web version somewhere permanent

```bash
npm run build
```

produces a `dist/` folder you can drag onto [Netlify](https://netlify.com)'s deploy page or point [Vercel](https://vercel.com) at — both are free and give you a permanent `https://` link with zero config.

## Notes on this build

- The Android app uses the phone's native camera (via Capacitor's Camera plugin), which is what makes gallery saving and permissions work properly — the web version falls back to the browser's own camera capture, which is a little less reliable across devices but doesn't need anything installed.
- All data lives in local storage on that specific device/app install — clearing app data or uninstalling removes it, so export PDFs of anything you want to keep long-term.
- This is a first working version matching the mockup we designed together — flag anything that feels off and it's easy to adjust.
