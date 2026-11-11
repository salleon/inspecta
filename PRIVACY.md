# Inspecta privacy policy

The privacy policy is published on Inspecta's website, at `/privacy/` (for example `https://inspecta.pages.dev/privacy/`, or the same path on Inspecta's own domain once it has one). That address goes in the Google Play and App Store listings.

Its source is [`site/privacy/index.html`](site/privacy/index.html): edit it there (and update the date at the top) so there's only one copy.

In short: Inspecta collects no data. Everything you create stays on your device.

## The website

`site/` is the whole website (home page, privacy policy, icons), served by Cloudflare Pages straight from the folder: no build step, and it doesn't use GitHub Actions minutes. Cloudflare publishes it on each push to `main` that changes `site/`. The icons in `site/` are copies of the app's (a unit test checks they match).

Set up once in the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git → this repo, then

- Production branch: `main`
- Framework preset: None; Build command: empty; Build output directory: `/`
- Root directory (advanced): `site`
- Afterwards, Settings → Build → Branch control: Preview branches **None**, and Build watch paths: include `site/*`
