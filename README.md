# Inspecta

A fast, offline-first app for on-site fire safety inspection capture — built to replace the slow multi-tap flow of apps like Site Audit Pro with a camera-first workflow. One codebase builds two apps (see **Two apps** below): **Inspecta - EnFact**, private to EnFact's staff, and **Inspecta - Site Inspections** (Contractor), for other companies through Google Play and the App Store.

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
- **Finding details** — every finding has optional **Defect type** (Critical / Non-critical / Non-compliance / Recommend / Note only / Rectified, colour-coded), **Level** (type `25` for "Level 25", quick buttons for Ground / Basement / Mezzanine / Roof, carried over to the next finding) and **ESR category** (below). (These used to sit behind an Advanced controls switch; every phone has them now.)
- **ESR categories** — each finding can be tagged with an item from the company's ESR list (`src/lib/esrCategories.ts`, e.g. "1.6 Fire Doors"). While the note is typed, the top 5 likely categories are suggested, grouped under their section; they come from built-in keywords plus the words of past picks on that phone (`src/lib/esrSuggest.ts`, offline, no AI service). "Browse all" has the full list with search. Before a PDF or Excel export, uncategorised findings can be categorised one at a time (skip, come back, or skip to export). Reports then group findings under a blue row per section and a grey row per item, similar notes together, with Refs like `1.6.1` (`src/lib/esrGrouping.ts`); Uncategorised goes last. The photos zip isn't grouped.
- **Admin** (Settings → Admin, PIN protected) — tune the ESR keywords on a phone (`src/lib/esrKeywords.ts` stores the changes over the built-in list), test a note's suggestions, share/load keyword files, share/load the company setup file (below), change the PIN, and email a recovery code for a forgotten PIN (`src/lib/adminPin.ts`). The PIN: EnFact phones use the office's PIN; a Contractor phone has none until its company's manager chooses one the first time Admin is opened. Staff phones that join with the company's setup file get the manager's PIN from it without anyone typing it (only its salted fingerprint is in the file and on the phone), so staff can't open Admin. The owner's master recovery code ("Forgot PIN?" → master code) opens Admin on any phone without changing the company's PIN. Only the master code's SHA-256 fingerprint is in the code, so changing it means generating a new code and replacing `MASTER_HASH`.

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
3. Once it finishes (green check), click into the run → scroll to **Artifacts** → download `enfact-apk`. Unzip it to get `app-enfact-release.apk`. (The workflow signs it with the release key from the repo's Actions secrets, so each build installs as an update over the last.)

   To build a branch other than `main`, or the Contractor app, open **Actions → Build Android APK → Run workflow**, pick the branch in **"Use workflow from"** and the app in **Which app** (EnFact, Contractor or Both). A push to `main` builds EnFact.
4. Send that `.apk` file to yourself (email, Slack, Drive — whatever's easiest) and open it **on the Android phone**. Android will ask you to allow installing from this source the first time — approve that, then install.

**Test apps:** the same run also produces `enfact-test-apk` (`app-enfact-staging.apk`), a separate app called "EnFact Test" (orange icon) with its own data, so you can try out a branch without touching the real app or its inspections. A Contractor build makes `contractor-apk` ("Inspecta") and `contractor-test-apk` ("Inspecta Test") the same way.

That's it — no Play Store, no hosting, just the one file. Whenever you want an updated build, push your changes and re-download the new artifact from Actions.

> A **work/managed Android device** may block installing APKs from outside the Play Store via its MDM policy — if the install is blocked or greyed out, that's an IT/device-policy restriction, not something fixable from this app; check with whoever manages the device policy.

### Automatic updates through Google Play (internal testing)

Coworkers can get the EnFact app from Google Play instead, as a private internal-testing app, so Play updates it on their phones by itself. The Play app ID is `au.com.inspecta.app`, the same as the APK, and Play signs with the same key, so the Play version installs over a sideloaded one and keeps its data.

- **Every run** of Build Android APK also makes `enfact-play-bundle` (`app-enfact-release.aab`), the file Play takes. The first one is uploaded by hand in the Play Console (Internal testing → Create new release).
- **To publish an update:** Actions → Build Android APK → Run workflow, Which app **EnFact**, tick **Publish to Play**, optionally fill in **What's new**. It builds, tests and uploads to the internal testing track; Play then updates everyone. Needs the `PLAY_SERVICE_ACCOUNT_JSON` secret (a Google Cloud service account with "Release apps to testing tracks" on the app).
- **In the app:** Inspecta asks Play on opening and shows an **Update ready** popup (Update now / Later), a download bar, then **Restart** (`src/lib/appUpdate.ts`, `@capawesome/capacitor-app-update`, Play's flexible in-app updates). Settings → **Check for updates** does the same on demand. Only works in the copy installed from Play, and only once Play has finished processing a release.
- **Coworkers, once:** open the internal testing opt-in link from the Play Console on their phone (signed in with the Google account on the testers list), accept, then install Inspecta from Play.
- **One-off signing key export:** when the Play Console asks how to sign the app, choose to use your existing key via "Export and upload a key from Java keystore", then paste the encryption key it shows into **play_encryption_key** on Run workflow. The run's `inspecta-signing-key-for-play` artifact (encrypted so only Google can open it) is the zip to upload there.

### Two Android apps

`android/app/build.gradle` has a flavor per app: `enfact` (`au.com.inspecta.app`, "EnFact" under the icon) and `contractor` (`au.com.inspecta.site`, "Inspecta"), each with its test build (`.test`, orange icon: "EnFact Test", "Inspecta Test"). Names are in `android/app/src/<flavor>/res` and `src/<flavor>Staging/res`. Each is built from its own web build: `npm run build:enfact` (or `build:contractor`), `npx cap sync android`, then e.g. `./gradlew assembleEnfactRelease`. Both use the same icon for now.

The Contractor app has its own Play app and its own upload key (Play won't take another app's). Setting it up, once:

1. **The key:** Actions → Build Android APK → Run workflow, tick **make_contractor_key** (the rest doesn't matter). Download the run's `contractor-upload-key` artifact and add its two files as Actions secrets of the same names, `CONTRACTOR_KEYSTORE_BASE64` and `CONTRACTOR_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions). Keep `contractor-upload.p12` and the password somewhere safe, then delete the artifact. Until the secrets are there, a Contractor build's release APK and bundle are unsigned.
2. **The Play app:** in the Play Console, Create app → "Inspecta - Site Inspections", free. Let Google make and keep the app signing key (the default).
3. **The first bundle by hand:** run Build Android APK with Which app **Contractor**, download `contractor-play-bundle`, and upload `app-contractor-release.aab` in the new app's Internal testing → Create new release.
4. **Publishing access:** in Play Console → Users and permissions, give the service account behind `PLAY_SERVICE_ACCOUNT_JSON` "Release apps to testing tracks" on the new app too. After that, Which app **Contractor** with **Publish to Play** sends it to its internal testing track. Production comes with the store listing (`claude-project/SPLIT_PLAN.md`, step 6).

### Build labels

Each app has its own build number: `BUILD_LABEL_ENFACT` and `BUILD_LABEL_CONTRACTOR` (repo root). It's shown in that app's Settings ("Build 9.7") and used as its Android version name (and the iPhone version, so numbers and dots only, like 9.7 or 1.0.1). Changed by hand only when that app is given out, not on every build.

## Backups

Settings → **Back up** makes a `.zip` of every site (**Full backup**), chosen sites (**Choose sites**), or the sites added or changed since their last backup (**New since last backup**), to share, e.g. to OneDrive. Inside, each site is its own folder: `site.json` (the site, its findings and tests) and `photos/`, the originals named after their finding (`F01 Level 2 - Exit sign out (1).jpg`); `backup.json` and `README.txt` say what the file holds. Past 4 GB the zip is Zip64. **Restore from backup** reads every site folder in the file (or an older single-`backup.json` backup): sites not on the phone are added; a site that's on the phone too and differs is, as you choose, **merged** (nothing on the phone is deleted: what's only in the backup is added, a finding changed on both keeps the later edit, and a test changed on both keeps both copies, the backup's marked *From backup*), brought in as its own site with **Keep both** ("Riverside Plaza (from backup)"), or left as it is; the rest are left as they are (`src/lib/backup.ts`, `src/lib/siteMerge.ts`). A merge or Keep both that stops part way is finished by restoring the same backup again. Each site records when it last changed and was last backed up; the Settings cog gets an amber dot when a site has gone a month with changes not in any backup. Settings, the name, the admin PIN and keyword changes aren't included. On start the app also asks the browser to keep its storage rather than clear it when space runs low. The app's data is kept out of the phone's own cloud backups (`android:allowBackup="false"`; on iPhone, `AppDelegate.swift` marks `Library/WebKit` as excluded from backup), so the app's Back up is the copy that counts.

## Tests

`npm test` runs the unit tests (`tests/unit`: suggestions, reference numbers, report grouping, keyword storage), builds both apps (`npm run build:test`: `dist-enfact/` and `dist-contractor/`, and checks the Contractor build has none of EnFact's artwork), then the browser tests (`tests/e2e`, headless Chromium via Playwright: finding screen, export and Categorise, grouped Excel/PDF, admin, backup/restore, upgrading an old database). GitHub Actions runs them on every push (`.github/workflows/tests.yml`), and the APK build only goes ahead if they pass — unless **Skip tests** is ticked on Actions → Build Android APK → Run workflow. Each browser test file starts the app(s) it tests: `startApp(import.meta.url)` for EnFact, `startApp(import.meta.url, { edition: "contractor" })` for Contractor. A unit test for the Contractor app sets `globalThis.__EDITION__ = "contractor"` before importing (see `tests/unit/flowTestContractor.test.ts`). First time locally: `npx playwright install chromium`.

## Planned

Ideas agreed but not started yet:

- **Standard corrective-action text** — a library of standard sentences per category (e.g. "Incumbent contractor to carry out annual inspection testing in accordance with AS1851…") to fill the Corrective action column with a tap.
- **Merge last year's report** — load the previous report for a site and mark its old findings as still present or rectified, flowing into the new report (with their old numbers). How it should work is still to be decided.

## Two apps: EnFact and Contractor

One codebase, two apps (plan and status: `claude-project/SPLIT_PLAN.md`). Which one is fixed when it's built: `npm run build:enfact` or `npm run build:contractor` (`vite build --mode enfact|contractor`; plain `npm run build` is EnFact). `src/lib/edition.ts` has `EDITION`, `IS_ENFACT` and `IS_CONTRACTOR`; nothing on a phone changes it. Keep the differences between the apps behind those, in as few places as possible, and say on each canvas mock-up what EnFact gets and what Contractor gets. Every change says which app it's for: **EnFact**, **Contractor** or **Both**.

- **EnFact's artwork** (its splash, logos, wordmark and AFSS / Projects covers) comes only through `virtual:edition-art` (`src/edition/art.ts`): `vite.config.ts` points it at `src/edition/enfact.ts`, or at `src/edition/contractor.ts` where every piece is null, so the Contractor build doesn't carry it. `scripts/check-edition.mjs` checks that on every test run. EnFact's lists (ESR categories, defect wording, flow equipment) are in both apps.
- **Paid features** (Contractor, later): `src/lib/features.ts` says what a phone's plan allows. Nothing is sold yet, so everything is on.
- **Company setup** (Contractor only, `src/components/CompanySetup.tsx`, `src/lib/company.ts`) — a new Contractor phone opens on a welcome with **Set up your company**: name, logo (resized PNG, optional white background) and colours (14 presets, Default first, three schemes built from the logo's colours, or custom). **Use default** skips the logo and colours: the app's own colours, applied as index.css has them, and the company name in an outlined box in place of a logo. Kept on the phone; Admin → Company (behind the admin PIN) changes it later, and the setup file carries it to staff phones. Canvas: "Inspecta for contractors".
- **Theme** — the company's scheme (dark primary, vivid secondary, near-white light) is only for the Contractor splash (`splashVars`, set on the splash's own element) and the report covers; the app's pages keep `index.css`'s own colours in both apps (`applyTheme` clears anything an older build set). Still use `var(--accent)`, `var(--bg)` etc. in screens, not hex values.
- **Branding** — the Contractor app never shows EnFact's: its own splash (the intro mark), the company logo on the home screen, the PDF cover (`src/lib/contractorCover.ts`: one flat JPEG background with a faint logo watermark, or with no logo EnFact's AFSS / PROJECTS square without its logo; the logo or name box top left; accent colours), the company logo on flow and stair reports (`src/lib/branding.ts`), and "EnFact recommend" wording swapped for the company name.
- **Setup file** (Admin → New phones, `src/lib/setupFile.ts`) — **Share setup file** saves `<Company> setup.inspecta`: which app made it (the other app refuses it), company name, logo and colours, ESR keyword changes and the admin PIN (only as a salted SHA-256 fingerprint). Whoever sets up phones (e.g. HR) keeps it. On a new phone, **Join a company** on the welcome (or Admin → Load setup file) loads it after asking for that PIN, which then becomes the phone's PIN. Nothing about sites, findings or the person is in it. Like the admin PIN, it keeps staff out rather than being a hard security boundary: EnFact's lists are inside the app either way.

Still to do for the public release (separate Android and iPhone apps, iPad, store listings), and later subscriptions, accounts and a web portal: `claude-project/SPLIT_PLAN.md`.

## The iPhone app

The same web app in an iOS shell (`ios/`, Capacitor), like `android/`:

- `ios/App/App/Plugins/` has the Swift side of the app's own plugins, matching the Android ones call for call: `NativeCameraPlugin.swift` (the in-app camera, `src/lib/nativeCamera.ts`) and `GalleryPlugin.swift` (copies photos to the photo library). They're registered in `MainViewController.swift`.
- Permissions wording, portrait lock and status bar are in `ios/App/App/Info.plist`.
- `npx cap sync ios` copies the built web app in (`ios/App/App/public` isn't tracked).
- `.github/workflows/build-ios.yml` checks it compiles on every push that touches it.

Differences from Android: the back camera zooms out to the ultra-wide by itself (no lens change), the volume-button shutter needs iOS 17.2+, each site's photos go in an album inside an "Inspecta" folder in Photos (`DCIM/Inspecta/<site>` on Android), and updates come through TestFlight / the App Store instead of the in-app prompt.

## Running it locally

You'll need [Node.js](https://nodejs.org) (18+) installed.

```bash
npm install
npm run dev
```

starts a local dev server of the EnFact app (`npx vite --mode contractor` for the Contractor app), usually at `http://localhost:5173`. There's no web version for others to use any more: the apps are the only way out (a separate web portal for companies is planned for later). A phone that ran the old web version, or an older app with its offline cache, has that cache cleared on start (`src/lib/offlineCache.ts`).

## Notes on this build

- The apps use the phone's native camera (the app's own camera plugin), which is what makes gallery saving and permissions work properly.
- All data lives in local storage on that specific device/app install — clearing app data or uninstalling removes it, so export PDFs of anything you want to keep long-term.
- This is a first working version matching the mockup we designed together — flag anything that feels off and it's easy to adjust.
