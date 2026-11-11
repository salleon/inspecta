# Inspecta: project context

Upload this to the Project's knowledge, with `README.md` and `CHANGELOG.md` (or sync the GitHub repo, below). Current as of 26 October 2026, Build 7.

## What it is

An offline-first app for fire safety inspectors at EnFact. Camera-first findings capture for AFSS (annual fire safety statement) and project sites, with PDF, Excel and photo-zip exports, plus test records: flow tests (sprinkler, hydrant) and stair pressurisation (SPF). It ships as an Android app (through Google Play internal testing) and as a PWA. All data stays on the phone; there are no accounts or cloud sync.

## Stack

- React 18 + TypeScript + Vite, react-router (hash routes)
- Capacitor 8 for Android (`android/`), app ID `au.com.inspecta.app`. Native Java plugins: `NativeCameraPlugin` (CameraX in-app camera), `GalleryPlugin`, `MainActivity`
- Dexie (IndexedDB) for storage: `src/db/db.ts` (schema and versions), `src/db/types.ts` (every record type)
- exceljs (Excel), jsPDF (PDF), vite-plugin-pwa, Manrope font
- Tests: Node's test runner. Unit tests in `tests/unit` (tsx), browser tests in `tests/e2e` (Playwright, headless Chromium, against `vite preview` of `dist/`). Lint: oxlint

## Where things are

- `src/pages/`: screens. `Dashboard` (home and + New site), `Findings` (a site's findings and Other tests), `Note` (a finding), `Export`, `Settings`, `Admin`, `FlowTest`/`FlowExport`, and the stair screens: `StairSystem` (setup), `LevelReview`, `StairNew`, `StairTestPage`, `StairSectionPage` (readings), `StairReport`
- `src/components/`: shared UI. `InAppCamera`, `MarkupEditor`, `PhotoViewer`, `NumPad`/`CellPad` (number pads), `TestsList` (Other tests), `Tour`, `UpdatePrompt`, `StairUi`
- `src/lib/`: logic. ESR categories and suggestions (`esr*.ts`, `commonDefects.ts`), exports (`excelExport`, `projectReport`, `photosZip`, `testsExport`), flow tests (`flowTest`, `flowEquipment`, `flowPdf`, `flowExcel`), stair tests (`stairTest` for rules, limits and statuses; `stairPrint` for what the report holds; `stairPdf`; `stairExcel`), `soundMeter`, `backup`, `appUpdate`, `tour`, `settings`
- `.github/workflows/`: `tests.yml` (every push), `build-apk.yml` (APK, Play bundle and Play publishing)
- `BUILD_LABEL`: the build number shown in Settings

## Commands

```
npm install
npm run dev          # local dev server
npm run build        # tsc + vite build to dist/
npm run lint
npm test             # unit tests, build, then e2e
npm run test:unit
npm run test:e2e     # needs a build first
```

If the e2e tests hang in a cloud container, Playwright can't find its browser. Point it at the installed one: `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`. In that container the tour test "Pick a topic runs just that topic" fails; it passes on GitHub, so ignore it there.

## Branches, CI and releases

- `test`: development. Every push runs the tests. Running Build Android APK on `test` also publishes **Inspecta Test** (a separate app with an orange icon and its own data) to the owner's own Play track.
- `main`: releases. Kept equal to `test` at each release (fast-forward).
- Release: bump `BUILD_LABEL`, add a CHANGELOG line, push to `main`, then Actions → Build Android APK → Run workflow on `main`, tick **Publish to coworkers**, fill in **What's new**. The run tests, builds and uploads to Play's internal testing track. Users get an "Update ready" popup in the app (Play's flexible in-app update) once Play has processed the release.
- Build 6 (25 Oct): in-app camera, photo markup, speed work, flow equipment suggestions.
- Build 7 (26 Oct): stair pressurisation (marked BETA), flow test number pad.

## Stair pressurisation: where it stands

Marked **BETA** in exactly two places: a tag after the Stair pressurisation heading on the home screen, and a ribbon on its New site button (`BetaTag`/`BetaRibbon` in `src/pages/Dashboard.tsx`). Remove both when it's finished. The owner doesn't want other beta labels, banners or dismiss buttons.

**How it works:** a site's system is set up once (the AS 1668.1 edition and type, the stairs with their highest and lowest levels and fan name, and a reviewed level layout). A stair test is General system testing, Annual Testing, Commissioning, Three-monthly check or Custom (EnFact mode, the Flow testing mode switch, shows only General, Annual and Custom). Sections:
- At every door: velocity, door force, door closes & latches
- Once per stair: noise (stair, occupied space, ambient, phone meter reference), pressure restoration, stair pressure with doors closed (`pa`), fan checks
- Three-monthly: ticks only

Limits come from `limits()` in `src/lib/stairTest.ts`. The report is a page per stair (`stairPrint.ts`), laid out like the AS 1851 record sheet, with blank columns where something wasn't tested.

**Built 10 Nov (on `test`, from the general system testing canvas):**
- General system testing: runs (`StairTest.runs`; run 1 is the test's own `doors`), each door's latest reading counts everywhere but the run's own screen and the report, which prints run by run with a page per group.
- Doors: one a level; `SpfStair.doors` sets more on every level, `SpfStair.more` holds doors added at a level from the readings screen (+ Door). A door's key is the level for the first door, `level<tab>B` on (`stairDoors` in `stairTest.ts`).
- Groups: `SpfStair.group`, a text field on the stair with chips for the groups already used (the mock-up had a + Group button).
- Marginal (yellow): within 0.1 m/s or 5 N of the limit and still a pass (`doorMarginal`).
- Review level layout in three drop-downs, and the P to B "change the rest" pop-up.
- Not done: the stair cards show every stair in a sideways row with the group after the name, not a "Tower ›" button; a run can't be deleted; once-a-stair readings (noise, restoration, pressure) aren't per run.

**Decided (25 Oct):**
1. Ambient noise: one reading per stair, re-recorded at a noisier door (the button highlights when Noisiest door changes). Done.
2. Ambient prints under Max noise, stair on the report ("ambient 64 dB(A) at 3"), since AS 1851 has no ambient column. Done.
3. Stair pressure, all doors closed: move it to **every door's row** (a new report column, as on the owner's sheet), and keep the stair box showing the highest reading. **Not started. This is the next step.**

**Step 3 plan:**
- `StairDoor` gets `pa`, and `SECTION.pa` becomes an every-door section (unit Pa).
- Add `"pa"` to the every-door handling (`doorFails`, `doorValue`, `doorStats`, the `Every` type, and `StairTestPage`'s casts).
- A Pa limit applies only on 1979 systems (≤ 50 Pa); otherwise the reading is just recorded.
- Add a "Pressure, doors closed Pa" column to `STAIR_HEAD`, and rebalance the PDF column widths in `stairPdf.ts`.
- The stair box becomes "highest N Pa at <level>". Old tests that have a stair-wide `once.pa` still show it.
- Count `pa` in `stairTestHasData`.
- Add an e2e test.

## The review list (from 10 Nov)

`claude-project/APP_REVIEW.md` is the whole-app review: bugs, speed, layout, wording and polish, with tick boxes. The owner is working through it one item (or a few) at a time, with oversight. Tick an item off there when it's done and add a CHANGELOG entry.

- Done so far: A1, A2 (amber dot on the Settings cog when a site has gone a month with changes not in any backup), A3 to A8, A12 to A15, and deleting a run (A11).
- Waiting on the owner: sending to iPhone. TestFlight only builds on a push to `main` (Codemagic), so it means merging `test` into `main`. Not done; ask first.
- **No builds until the owner says** (10 Nov). Don't run Build Android APK. Pushing to `test` is fine: it only runs the tests and the iPhone compile check.
- The phone has the first stair build of 10 Nov (general system testing). Everything after it (the remove/clear controls, A1 to A3) is on `test` but not on a phone.
- Browser tests need `CHROMIUM_PATH=/opt/pw-browsers/chromium` in a cloud session. One tour test ("Pick a topic runs just that topic") fails there on untouched code and passes on GitHub.

## Owner's preferences (learned)

- Wants things brief, in chat and in the app. Called out a too-wordy note in a mock-up.
- Likes seeing mock-ups (on a Claude design canvas) before building visual changes; picks from options.
- Decides what goes to `main` and when; asked once for only part of `test` to be merged.
- Gets frustrated by slow, opaque progress; say what's happening and why.

## Links

- Mock-up canvas for the Beta marking: https://claude.ai/artifact/BBAmhXo4u3mvATQsxEYLUa
- Mock-up canvas for general system testing, doors, groups and the level review: https://claude.ai/artifact/WWJ6jKYhTJA7AjVGJayQ9M
- Repo: https://github.com/salleon/inspecta
