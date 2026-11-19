# Splitting Inspecta into two apps

Agreed with the owner on 19 November 2026. One codebase, two apps:

| | **Inspecta - EnFact** | **Inspecta - Site Inspections** |
|---|---|---|
| Who | EnFact's own staff | Other contractors, public |
| Name under the icon | EnFact | Inspecta |
| Android | Private, Play internal testing (as today) | Public, Play production |
| iPhone / iPad | iPhone only, TestFlight, for the owner to check things at home. Never the App Store | iPhone and iPad, App Store |
| App ID | `au.com.inspecta.app` (unchanged, so phones update in place and keep their data) | New, e.g. `au.com.inspecta.site` (Android and iOS) |
| Version | `BUILD_LABEL_ENFACT` | `BUILD_LABEL_CONTRACTOR` |
| Price | Free | Free to start; subscription tiers added later |

Facts that shaped it: no phone is in Contractor mode today, so nothing needs moving. EnFact's ESR, defect and flow lists ship in the Contractor app too (the owner will refine Contractor's copy later). Nobody uses the web version (PWA), so it is dropped.

## The rule for every change

Every change states which app it is for: **EnFact**, **Contractor** or **Both**. Ask if it isn't clear. The commit title and the CHANGELOG entry carry the same tag. A release says which app(s) it goes to. Contractor-only changes may also need a plan check (Free / Pro) once subscriptions exist.

## Steps

Done: 1, 2 and 3's code (19 November 2026, on `test`). Step 3 waits on the owner for the Contractor Play app (README, "Two Android apps"). Next: 4.

1. **Pick the app when it's built, not on the phone.** `src/lib/edition.ts` holds a fixed `EDITION` (`IS_ENFACT`, `IS_CONTRACTOR`) from `vite build --mode enfact|contractor` (or `VITE_EDITION`), in place of the old mode checks. Remove switching on the phone: Admin → Mode, five taps on the splash, switching through the master code, `settleMode`. A setup file from the other app is refused. Arrange imports so EnFact-only artwork (logo, splash letters, AFSS covers) is left out of the Contractor build (`src/edition/`), and the tests fail if any of it is in the Contractor build (`scripts/check-edition.mjs`; the word "EnFact" itself stays, in EnFact's lists, which ship in both). Add `src/lib/features.ts` (what this phone's plan allows), with everything unlocked for now. Drop the PWA (service worker and manifest), keeping the clean-up that removes an old service worker. No change on screen.
2. **Tests for both.** CI builds `dist-enfact` and `dist-contractor` and runs the browser tests on each. Each test file says which app(s) it covers. Retire the mode-switching and secret-corner tests.
3. **Android: two apps from one project.** Gradle product flavors `enfact` and `contractor` (own ID, name, icon), each with its Test build. Build Android APK gets an **App** choice (EnFact / Contractor / Both) and publishes each to its own Play app. Contractor needs a new Play app and upload key. Each app has its own `BUILD_LABEL_ENFACT` / `BUILD_LABEL_CONTRACTOR`. The Contractor test app isn't on Play (no upload key of its own); its APK is for installing by hand.
4. **iPhone: two apps in the Xcode project.** EnFact: iPhone, TestFlight only. Contractor: iPhone and iPad, new bundle ID and App Store Connect record. A Codemagic job for each, started deliberately rather than by every push to `main`.
5. **iPad and Android tablet layout.** Mock-ups first (a centred column, or real use of the width), then rotation, the camera on iPad, pads and dialogs at that size.
6. **Store readiness (Contractor).** Listings, privacy policy, Play Data safety form, Apple privacy labels, encryption declaration, content rating, phone and iPad screenshots. Check whether the Play account needs 12 testers for 14 days of closed testing first (personal accounts made after November 2023).

## Later

- **Subscriptions (Contractor).** Free to download; tiers (e.g. Free / Pro / Team) for pro features and database integration. Must use Apple's and Google's in-app payments; likely through one service such as RevenueCat. Tiers to be decided.
- **Accounts and cloud sync.** Needed for database integration (see PROJECT_CONTEXT.md, "Later").
- **Web portal.** A separate website, not the app in a browser, for proper site management by a company.
