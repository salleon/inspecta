# Inspecta

Read `claude-project/PROJECT_INSTRUCTIONS.md` and `claude-project/PROJECT_CONTEXT.md` first; they hold how the owner works, branches, releases and code style.

## Two apps, one codebase

This repo builds two apps (plan and status: `claude-project/SPLIT_PLAN.md`):

- **Inspecta - EnFact**: EnFact's own staff. Private (Play internal testing; iPhone on TestFlight only).
- **Inspecta - Site Inspections** (Contractor): public, Play and App Store, iPhone and iPad.

For every change, decide and say which app it is for: **EnFact**, **Contractor** or **Both**. If it isn't clear, ask before building. Tag the commit title and the CHANGELOG entry the same way, e.g. `[Both] Flow tests: …`. A release states which app(s) it goes to. Keep differences between the apps behind the edition check, in one place.

**Never bump a version or build number unless the owner says so.**
