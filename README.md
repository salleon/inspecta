# Inspecta

A fast, offline-first app for on-site fire safety inspection capture — built to replace the slow multi-tap flow of apps like Site Audit Pro with a camera-first workflow. Ships two ways: as an installable web app (PWA), and as a real Android `.apk`.

## What it does

- **Sites dashboard** — list of sites/inspections, split into AFSS and Project work sections, tap to jump straight into the camera for that site, or start a new one.
- **Camera-first capture** — the shutter is always one tap away. Capturing a photo creates a new finding and drops you straight into a note screen; saving returns you to the camera immediately (no menus, no dashboards in between).
- **Multi-photo findings** — if one angle isn't enough, add extra photos to the finding you're currently on right from the camera screen.
- **Findings without a photo** — the pen on the left of **Save & next** / **New finding** starts a finding with just a note (no camera). A finding left completely empty isn't kept.
- **Photos from the gallery** — the picture tile after the + on a finding adds existing photos (one or several), stamped with when they were taken. The + and gallery tiles stay pinned while the thumbnails scroll.
- **First-time tour** — offered once per phone (new users after entering their name, existing users on their first opening after the update) (Settings → Replay tour any time): lights up one button at a time and walks through every screen on a temporary Example site, deleted when the tour ends (`src/lib/tour.ts`, `src/components/Tour.tsx`).
- **Full-screen photos** — tap the photo on a finding to view it full screen: swipe between its photos, pinch or double-tap to zoom, drag down, ✕ or Android back to close (`src/components/PhotoViewer.tsx`).
- **Retake / delete** — fix a bad shot without leaving the note screen.
- **Saves straight to your gallery** — on the Android app, every photo is also saved to your phone's normal photo gallery via the native camera, independent of the app.
- **Everything stored offline** — findings, notes, locations and full-resolution photos are saved to the device (IndexedDB) as you go, no signal required. Nothing is lost if you close the app or lose connection.
- **PDF export** — generates a report with every photo (burned-in time/date stamp), location and note, ready to share.
- **Excel export** — fills the company findings-register template (`src/assets/findings-template.xlsx`): one row per finding with location, description, full-resolution stamped photos (5 cm wide), date identified, risk level (colour-filled) and status. Built for desktop Excel.
- **Send Photos Only** — every photo on the site at full camera resolution, with the time/date stamp, in one zip (e.g. `Harbour Tower.zip`) holding a folder named after the site. Files are named `01 - Level 25 - Back of house kitchen.jpg` in the same finding order as the PDF and Excel. Share it to OneDrive, then *Extract All* on the laptop.
- **Location suggestions** — while typing a location, up to 3 buttons suggest locations already used on *this site* (most recent first, filtered as you type). Tap one to fill it in.
- **Finding details** — every finding has optional **Defect type** (Critical / Non-critical / Non-compliance / Recommend / Note only / Rectified, colour-coded), **Level** (type `25` for "Level 25", quick buttons for Ground / Basement / Mezzanine / Roof, carried over to the next finding) and **ESR category** (below). (These used to sit behind an Advanced controls switch; it was removed, and the EnFact / Contractor mode in Admin is the switch now.)
- **ESR categories** — each finding can be tagged with an item from the company's ESR list (`src/lib/esrCategories.ts`, e.g. "1.6 Fire Doors"). While the note is typed, the top 5 likely categories are suggested, grouped under their section; they come from built-in keywords plus the words of past picks on that phone (`src/lib/esrSuggest.ts`, offline, no AI service). "Browse all" has the full list with search. Before a PDF or Excel export, uncategorised findings can be categorised one at a time (skip, come back, or skip to export). Reports then group findings under a blue row per section and a grey row per item, similar notes together, with Refs like `1.6.1` (`src/lib/esrGrouping.ts`); Uncategorised goes last. The photos zip isn't grouped.
- **Admin** (Settings → Admin, PIN protected, default `2021`) — tune the ESR keywords on a phone (`src/lib/esrKeywords.ts` stores the changes over the built-in list), test a note's suggestions, share/load keyword files, share/load the company setup file (below), switch Mode, change the PIN, and email a recovery code for a forgotten PIN (`src/lib/adminPin.ts`). "Forgot PIN?" also takes the owner's master recovery code; only its SHA-256 fingerprint is in the code, so changing it means generating a new code and replacing `MASTER_HASH`.

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

### Automatic updates through Google Play (internal testing)

Coworkers can get Inspecta from Google Play instead, as a private internal-testing app, so Play updates it on their phones by itself. The Play app ID is `au.com.inspecta.app`, the same as the APK, and Play signs with the same key, so the Play version installs over a sideloaded one and keeps its data.

- **Every run** of Build Android APK also makes `inspecta-play-bundle` (`app-release.aab`), the file Play takes. The first one is uploaded by hand in the Play Console (Internal testing → Create new release).
- **To publish an update:** Actions → Build Android APK → Run workflow, tick **Publish to coworkers**, optionally fill in **What's new**. It builds, tests and uploads to the internal testing track; Play then updates everyone. Needs the `PLAY_SERVICE_ACCOUNT_JSON` secret (a Google Cloud service account with "Release apps to testing tracks" on the app).
- **In the app:** Inspecta asks Play on opening and shows an **Update ready** popup (Update now / Later), a download bar, then **Restart** (`src/lib/appUpdate.ts`, `@capawesome/capacitor-app-update`, Play's flexible in-app updates). Settings → **Check for updates** does the same on demand. Only works in the copy installed from Play, and only once Play has finished processing a release.
- **Coworkers, once:** open the internal testing opt-in link from the Play Console on their phone (signed in with the Google account on the testers list), accept, then install Inspecta from Play.
- **One-off signing key export:** when the Play Console asks how to sign the app, choose to use your existing key via "Export and upload a key from Java keystore", then paste the encryption key it shows into **play_encryption_key** on Run workflow. The run's `inspecta-signing-key-for-play` artifact (encrypted so only Google can open it) is the zip to upload there.

### Build label

`BUILD_LABEL` (repo root) is the build number handed out to the team, shown in Settings ("Inspecta · Build 2") and used as the Android version name. It's changed by hand only when a build is given out — not on every APK build.

## Backups

Settings → **Back up all data** saves every site, finding and photo in one `.zip` (records in `backup.json`, original photos in `photos/`) to share, e.g. to OneDrive. **Restore from backup** adds the sites from such a file; a site already on the phone is left exactly as it is, so nothing is overwritten (`src/lib/backup.ts`). Settings, the name, the admin PIN and keyword changes aren't included. On start the app also asks the browser to keep its storage rather than clear it when space runs low.

## Tests

`npm test` runs the unit tests (`tests/unit`: suggestions, reference numbers, report grouping, keyword storage) and then, against a production build, the browser tests (`tests/e2e`, headless Chromium via Playwright: finding screen, export and Categorise, grouped Excel/PDF, admin, backup/restore, upgrading an old database). GitHub Actions runs them on every push (`.github/workflows/tests.yml`), and the APK build only goes ahead if they pass — unless **Skip tests** is ticked on Actions → Build Android APK → Run workflow. First time locally: `npx playwright install chromium`.

## Planned

Ideas agreed but not started yet:

- **Standard corrective-action text** — a library of standard sentences per category (e.g. "Incumbent contractor to carry out annual inspection testing in accordance with AS1851…") to fill the Corrective action column with a tap.
- **Merge last year's report** — load the previous report for a site and mark its old findings as still present or rectified, flowing into the new report (with their old numbers). How it should work is still to be decided.

## EnFact and Contractor modes

One app serves EnFact's office and other contractors. **Admin → Mode** (EnFact / Contractor, `src/lib/settings.ts`) decides which: a newly installed phone starts in **Contractor**; the office switches its phones to EnFact (or loads EnFact's setup file) before handing them out. Phones already in use when modes came in stay EnFact. Features that differ go behind the mode; keep those differences in one place, and say on each canvas mock-up what EnFact gets and what Contractor gets.

- **Company setup** (Contractor only, `src/components/CompanySetup.tsx`, `src/lib/company.ts`) — a new Contractor phone opens on a welcome with **Set up your company**: name, logo (resized PNG, optional white background) and colours (14 presets, Default first, three schemes built from the logo's colours, or custom). **Use default** skips the logo and colours: the app's own colours, applied as index.css has them, and the company name in an outlined box in place of a logo. Kept on the phone; Settings → Company changes it later. Canvas: "Inspecta for contractors".
- **Theme** — the company's scheme (dark primary, vivid secondary, near-white light) is only for the Contractor splash (`splashVars`, set on the splash's own element) and the report covers; the app's pages keep `index.css`'s own colours in both modes (`applyTheme` clears anything an older build set). Still use `var(--accent)`, `var(--bg)` etc. in screens, not hex values.
- **Branding** — Contractor mode never shows EnFact's: its own splash (the intro mark), the company logo on the home screen, the PDF cover (`src/lib/contractorCover.ts`: one flat JPEG background with a faint logo watermark, or with no logo EnFact's AFSS / PROJECTS square without its logo; the logo or name box top left; accent colours), the company logo on flow and stair reports (`src/lib/branding.ts`), and "EnFact recommend" wording swapped for the company name.
- **Setup file** (Admin → New phones, `src/lib/setupFile.ts`) — **Share setup file** saves `<Company> setup.inspecta`: the mode, company name, logo and colours, ESR keyword changes and the admin PIN (only as a salted SHA-256 fingerprint). Whoever sets up phones (e.g. HR) keeps it. On a new phone, **Join a company** on the welcome (or Admin → Load setup file) loads it after asking for that PIN, which then becomes the phone's PIN. Nothing about sites, findings or the person is in it. Like the admin PIN, it keeps staff out rather than being a hard security boundary: EnFact's lists are inside the app either way.

Still to decide for a public release: the Play listing (production track, privacy policy, a neutral app name and icon, since one icon serves both modes) and whether contractors need accounts, shared sites or cloud sync (everything is on the phone today).

## The iPhone app

The same web app in an iOS shell (`ios/`, Capacitor), like `android/`:

- `ios/App/App/Plugins/` has the Swift side of the app's own plugins, matching the Android ones call for call: `NativeCameraPlugin.swift` (the in-app camera, `src/lib/nativeCamera.ts`) and `GalleryPlugin.swift` (copies photos to the photo library). They're registered in `MainViewController.swift`.
- Permissions wording, portrait lock and status bar are in `ios/App/App/Info.plist`.
- `npx cap sync ios` copies the built web app in (`ios/App/App/public` isn't tracked).
- `.github/workflows/build-ios.yml` checks it compiles on every push that touches it.

Differences from Android: the back camera zooms out to the ultra-wide by itself (no lens change), the volume-button shutter needs iOS 17.2+, each site's photos go in an album inside an "Inspecta" folder in Photos (`DCIM/Inspecta/<site>` on Android), and updates come through TestFlight / the App Store instead of the in-app prompt.

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
