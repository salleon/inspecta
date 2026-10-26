# Inspecta: instructions for Claude

Paste everything below the line into the Project's custom instructions.

---

You're helping build **Inspecta**, an offline-first Android app (React + Capacitor) for on-site fire safety inspections, made for EnFact. Repo: `salleon/inspecta`. Read `PROJECT_CONTEXT.md` in project knowledge before starting work; `README.md` and `CHANGELOG.md` are the source of truth for what the app does.

## How I like to work

- **Be brief.** Short answers, no padding, no restating what I said. In the app, keep wording to a minimum: short labels, no explanatory paragraphs, no hints unless I ask.
- **Mock up first** when something is visual or the design isn't settled. Show it before building. Offer 2–3 options when the choice is real, recommend one, and once I pick, apply it everywhere I asked and nowhere else.
- **Ask when a decision is mine**, with your recommendation first. Don't guess on what the app records, prints or exports.
- **Work in steps.** Each finished step is committed and pushed on its own, with a CHANGELOG entry.
- **Speed matters.** If something is taking long (a hung test, a slow build), stop and find out why. Don't wait on it.

## Branches and releases

- Develop on `test`. Never create other branches. `main` is releases only.
- Merge to `main` only when I say so. If `main` is behind `test`, fast-forward it rather than adding a merge commit.
- A release to coworkers: bump `BUILD_LABEL` (one number, by hand), add a "Build N, out to coworkers" CHANGELOG line, push to `main`, then run Actions → **Build Android APK** on `main` with **Publish to coworkers** ticked and a short **What's new** (500 characters max, plain English, user-facing). Play's in-app update popup reaches users once Play finishes processing.

## Commits and CHANGELOG

- Commit messages: a short title, then technical detail (files, approach, tests).
- CHANGELOG entries: plain English for an inspector, newest first under a `## <day> <Month> <year>` heading, bold lead-in, what changed and why it matters, no code names. Match the existing entries.
- Every behaviour change gets an e2e or unit test where practical (`tests/e2e/*.test.mjs`, `tests/unit/*.test.ts`).

## Code style

- Match the surrounding code: inline styles, short plain comments, the app's colours (navy `#071b2c`, teal accent, purple for stair pressurisation, blue for flow tests, amber `#f7b977` for requirements and BETA).
- Numbers are typed on the app's own number pads (`NumPad`, `CellPad`), never the phone keyboard.
- Features that differ between EnFact and Contractor go behind Admin → Flow testing mode. Keep those differences in one place.
- Everything is stored on the phone (IndexedDB via Dexie). Schema changes need a Dexie version bump and must keep old data opening (see `tests/e2e/upgrade.test.mjs`).

## Standards

Stair pressurisation follows AS 1668.1 (the edition the system was built to: 1979, 1991, 1998 or 2015) for limits, and AS 1851-2012 for servicing and record sheets. Flow tests and ESR categories follow EnFact's own lists in the code. Don't invent limits or clauses; ask if unsure.
