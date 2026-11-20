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
- `BUILD_LABEL_ENFACT`, `BUILD_LABEL_CONTRACTOR`: each app's build number, shown in its Settings

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

The full playbook (both apps, their Test apps and iPhone builds) is `claude-project/RELEASING.md`.

- `test`: development. Every push runs the tests. Running Build Android APK on `test` also publishes **Inspecta Test** (a separate app with an orange icon and its own data) to the owner's own Play track.
- `main`: releases. Kept equal to `test` at each release (fast-forward).
- Release (EnFact): bump `BUILD_LABEL_ENFACT`, add a CHANGELOG line, push to `main`, then Actions → Build Android APK → Run workflow on `main`, Which app **EnFact**, tick **Publish to Play**, fill in **What's new**. The run tests, builds and uploads to Play's internal testing track. Users get an "Update ready" popup in the app (Play's flexible in-app update) once Play has processed the release.
- Build 6 (25 Oct): in-app camera, photo markup, speed work, flow equipment suggestions.
- Build 7 (26 Oct): stair pressurisation (marked BETA), flow test number pad.

## Stair pressurisation: where it stands

Marked **BETA** in exactly two places: a tag after the Stair pressurisation heading on the home screen, and a ribbon on its New site button (`BetaTag`/`BetaRibbon` in `src/pages/Dashboard.tsx`). Remove both when it's finished. The owner doesn't want other beta labels, banners or dismiss buttons.

**How it works:** a site's system is set up once (the AS 1668.1 edition and type, the stairs with their highest and lowest levels and fan name, and a reviewed level layout). A stair test is General system testing, Annual Testing, Commissioning, Three-monthly check or Custom (EnFact mode, the Flow testing mode switch, shows only General, Annual and Custom). Sections:
- At every door: velocity, door force, door closes & latches
- Once per stair: noise (stair, occupied space, ambient, phone meter reference), pressure restoration, stair pressure with doors closed (`pa`), fan checks, duct probe (`probe`: `StairOnce.probe`, a list of goes, the test then retests; stopwatch from `started`; 60–90 s pass, 5 s either side marginal; `components/DuctProbes.tsx`, rules in `stairTest.ts` `probeResult`)
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

## Later: not yet, come back to it

- **iOS SDK deadline: April 2027 (Apple notice ITMS-90725, 19 Nov 2026, on version 9.7 build 11).** Apple accepted the build but warned it was made with the iOS 26.5 SDK. From April 2027, App Store Connect only takes builds made with the iOS 27 SDK (Xcode 27) or later. Codemagic (`codemagic.yaml`, `ios-testflight`) is set to `xcode: latest`, so it should switch by itself once Codemagic offers Xcode 27. Before April 2027, check that a TestFlight build no longer gets this warning; if it still does, pin the Xcode version in `codemagic.yaml`. The GitHub iPhone compile check (`build-ios.yml`, `runs-on: macos-15`) only compiles, never uploads, so it isn't affected, but move it to a newer macOS runner at the same time to keep it close to what ships.
- **Two apps: EnFact (in-house) and Contractor (App Store) (owner, 19 Nov).** Eventually split Inspecta into the in-house EnFact version and a general contractor version for the app stores. About 90% of the features go into Contractor, not all of them; design and features differ a little, and Contractor has a paid tier. Today the differences sit behind Admin → Flow testing mode; that switch is the seed of the split. When it comes, decide per feature which version gets it, and keep one codebase with the differences in one place. Not started; don't start until the owner says.
  - **How to split (decided 19 Nov: one codebase, two apps; not started):** one repo, two builds, never a fork. The edition (enfact | contractor) becomes a build-time setting instead of the Admin switch, so each build only contains its own edition's code (no hidden modes for app review). Each edition gets its own app id, name, icon, theme and store listing (Capacitor config and Codemagic/Android workflows per edition). Features declare which edition has them in one file (e.g. `src/lib/edition.ts`: `has("servicing")`, values both | contractor | enfact | off); today's `isContractor`/`useFlowMode` checks move onto it. Half-finished work sits at `off`.
  - **Distribution:** Contractor on the public Play Store and App Store (paid tier: likely Play Billing / In-App Purchase; check the rules then). EnFact privately, so the stores don't see two near-duplicate public apps: Android via a managed Google Play private app to EnFact's organisation (a private app can't later be made public), or the Play internal testing track it uses now; iPhone via Apple Business Manager (Custom App) if ever needed.
  - **Day-to-day:** every change is shared unless it says otherwise. Commits and changelog entries are labelled [Both], [Contractor] or [EnFact]; CHANGELOG has a section per edition. CI builds and tests both editions on every push, with tests that an edition-only feature is absent from the other. Releases are per edition and independent (tags `contractor-vX` / `enfact-vX`, separate version numbers); before a release, list the commits since that edition's last tag and check them against it. Claude asks which edition a change is for when it isn't clear.
- **Servicing: a new report type, Contractor only (owner, 19 Nov).** For contractors working to a purchase order, doing defect repairs or annual servicing. They photograph their repairs as proof so their invoices get paid, and for each item write what the defect was and how they repaired it. Develop it fully only once the EnFact and Contractor apps are split; not before. Mock it up on a design canvas before building. Annual servicing likely follows AS 1851-2012, as the stair servicing does; ask before assuming limits or clauses.
  - **Reference: a contractor's service report (44 pages, 19 Nov: `claude-project/reference/Tradewise_Service_Report_example.pdf`).** Header: contractor logo and details, issue date, job number; a Site | Client | Reference (work order / PO) box. Job description grouped by system (Hydrant, Sprinkler, tanks), each item "Issue n" (the defect, bullets) then "Action" (bullets); access notes and site contact in red. Notes are terms (hours, parking, variations, exclusions). Labour table: name, note, work date, start, finish. Then photos, one per page (about 38 pages), with the phone's date, time and address stamped on.
  - **What to do better:** tie each photo to its issue (before / after) instead of a pile at the end, several per page; give each issue an outcome (Done, Quoted separately, No access, No action) and say what was actually done, not only the planned action; one work note for the crew, not the same paragraph repeated per person; PO number, attendance times and a summary of outcomes on page 1 so an invoice can be checked at a glance; no half-empty pages. Defects could come straight from an Inspecta AFSS report's findings, so the contractor ticks each one off with a photo.
- **Web interface and accounts (owner, 11 and 19 Nov).** A website so people can work with their sites, servicing and inspection data from a laptop: a company signs in and manages its sites, dates and data, uploaded from the apps of all its contractors and gathered under one company. Needs accounts first. Too early to build; don't start it until the owner says. Ground already laid: every site, finding, photo and test has a stable id; each site records `changedAt` and `backedUpAt`; and a backup holds each site as a self-contained folder (`site.json` + photos). Those are the starting point for uploading per site and syncing only what changed.
- **Flow testing: optional readings like amps (owner, 19 Nov).** Let a flow test turn on extra readings (amps etc.) the way stair pressurisation does, simply adding test rows / columns. Owner will explain later; ask before designing.

## Owner's preferences (learned)

- Wants things brief, in chat and in the app. Called out a too-wordy note in a mock-up.
- Likes seeing mock-ups (on a Claude design canvas) before building visual changes; picks from options.
- Decides what goes to `main` and when; asked once for only part of `test` to be merged.
- Gets frustrated by slow, opaque progress; say what's happening and why.
- Report layouts (stair, AFSS / Project, flow test PDFs and Excel) are reviewed piece by piece on a design page before building; the approved designs are the Links below.
- The in-app export previews (flow tests, AFSS / Project) are meant to look different from the exported files: the owner likes the previews as they are (visual, for the phone) and the exports as clean, professional tables. Don't change a preview to match its export unless asked.

## Links

- Mock-up canvas for the Beta marking: https://claude.ai/artifact/BBAmhXo4u3mvATQsxEYLUa
- Mock-up canvas for general system testing, doors, groups and the level review: https://claude.ai/artifact/WWJ6jKYhTJA7AjVGJayQ9M
- Mock-up canvas for the backup options and the folder per site: https://claude.ai/artifact/VJz9KTwP39Uohvp6jUrbfh
- Approved report designs (19-20 Nov 2026): stair report https://claude.ai/artifact/85hDmhgveRNwsbBZHaBbnc, AFSS / Project report https://claude.ai/artifact/WyUjcLSc1BnYXCA585Jv3z, flow test report https://claude.ai/artifact/UfAj76SCx3YKyzSJPHDpiX
- Repo: https://github.com/salleon/inspecta
