# Releasing: which app, which branch, what to press

One codebase builds both apps, so a change made once reaches both. The tags
EnFact / Contractor / Both only say who a change affects. Nothing is ever
copied from one app to the other.

## Branches

- `test`: all work. Every Claude session commits and pushes here.
- `main`: releases only. Changes only when the owner says "release", by
  fast-forwarding to `test` (it takes everything on `test`).

## The six apps

| App | ID | Comes from | How it's built |
|---|---|---|---|
| Inspecta - EnFact, Android | `au.com.inspecta.app` | `main` | Actions → Build Android APK on `main`, App **EnFact**, **Publish to Play** ticked |
| EnFact Inspecta Test, Android | `au.com.inspecta.app.test` | `test` | Actions → Build Android APK on `test`, App **EnFact** |
| Inspecta - EnFact, iPhone (TestFlight) | `au.com.inspecta.app` | `main` | Codemagic, starts by itself on every push to `main` |
| Inspecta - Site Inspections, Android | `au.com.inspecta.site` | `main` | Actions → Build Android APK on `main`, App **Contractor**, **Publish to Play** ticked |
| Site Inspections Test, Android | `au.com.inspecta.site.test` | `test` | Actions → Build Android APK on `test`, App **Contractor** |
| Inspecta - Site Inspections, iPhone (TestFlight) | `au.com.inspecta.site` | `main` | Codemagic → Start new build → "Inspecta - Site Inspections (iOS)" on `main`, by hand |

## What the owner says, and what Claude does

**"Put this on my test phone"** (EnFact, Site Inspections or both)
1. Commit and push to `test`.
2. Tell the owner: Actions → Build Android APK → Run workflow, branch `test`, App EnFact / Contractor / Both.

**"Release EnFact"**
1. Bump `BUILD_LABEL_ENFACT`, add a "[EnFact] Build N, out to coworkers" CHANGELOG line, push to `test`.
2. Fast-forward `main` to `test` and push. (The EnFact iPhone build starts by itself.)
3. Give the owner a What's new (500 characters max, plain English) and tell them: Actions → Build Android APK on `main`, App EnFact, tick Publish to Play, paste What's new.

**"Release Site Inspections"**
1. Bump `BUILD_LABEL_CONTRACTOR`, add a "[Contractor] Build N" CHANGELOG line, push to `test`.
2. Fast-forward `main` to `test` and push. (This also starts an EnFact iPhone build; that's harmless.)
3. Give the owner a What's new and tell them: Actions → Build Android APK on `main`, App Contractor, tick Publish to Play; then Codemagic → Start new build → "Inspecta - Site Inspections (iOS)" on `main`.

Before any release, say in one line what's on `test` that isn't on `main`
yet (`git log --oneline origin/main..origin/test`), so the owner knows what
goes out.

## The release map (keep it current)

The owner's pinned reference page is https://claude.ai/artifact/8S4BAqGdRfDEE2B7SRCvcW.
Its source is `claude-project/release-map.html`.

Update it whenever a release goes out, or an app, branch, build step or
build label changes (including the "Right now" section and its "Last
updated" date):
1. Edit `claude-project/release-map.html` and commit it with the change.
2. Publish it to the same page: Artifact tool, publish, `url` set to the
   link above. Read the page first (`action: "read"`) and build on what
   comes back, in case it was updated elsewhere.
Never publish it as a new page: the owner relies on that one link.
