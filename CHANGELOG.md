# Changelog

Plain-English notes on what changed in the app, newest first. Each entry
matches a commit on the `test` branch (called `advanced_controls` until
29 September 2026) or `main`; the commit itself has
the technical detail.

## 30 September 2026

- **Repeat exports are much quicker.** The date-stamped photos made for an
  Excel or PDF are now kept with each photo's 1200 px copy, so exporting
  the same site again reuses them instead of stamping every photo again.
  In a 30-photo test on a slowed-down browser: Excel 20.5 s the first time
  (making the copies), 3.7 s after; PDF 6.1 s, then 2.2 s. The PDF also
  takes the photos as raw bytes now, which uses much less memory.
- **Scan animation on the export preview.** While each preview photo is
  made, a teal line scans its box; when it's ready the photo is revealed
  top to bottom behind the line (canvas option PE).
- **Export timings in Admin.** Admin → Last export timings shows how long
  each stage of this phone's last export took, and how many photos already
  had their copy, to pin down a slow export on a particular phone.
- **Share without waiting for the preview.** The export screen shows the
  findings and enables Share Excel / Share PDF straight away; the preview
  photos fill in behind (grey boxes until they're ready) and pause while an
  export runs.
- **Awning wording updated.** The corrective action for an awning with a
  large overhang now gives both limits: less than 2.3 m (Ord 70) and
  2.5 m (1999 onwards).
- **Faster exports on slower phones.** Each photo now gets a smaller copy
  (1200 px, upright) made in the background soon after it's taken, and the
  PDF and Excel exports work from that instead of loading the full 12 MP
  photo every time. Photos already in the app get theirs when the export
  screen first opens. Exported photos are now 1200 px (were 1600 px),
  still around 600 dpi at the size they're printed. The photos zip and
  backups still use the full-resolution originals. In a 20-photo test on a
  slowed-down browser, an Excel export went from about 4.7 s to 1.7–2.5 s.
- **Share Excel is the main export button.** On the export screen, Share
  Excel is now the teal button on the right and Share PDF the plain one
  beside it.
- **Loading animations are now videos.** The PDF, Excel, photos zip and
  backup animations, and the gears on the updating screen, are played as
  pre-rendered videos instead of being drawn frame by frame, so they no
  longer stutter while the phone is busy building the export. The big
  percentage still climbs with the real progress; the picture just loops.
  The photos zip no longer counts photos on the pouch (the line under the
  title still does). `scripts/render-animations.mjs` re-renders the videos
  after a change to the pictures.
- **Test branch builds go to Inspecta Test on Play.** Every build of the
  `test` branch now publishes Inspecta Test to its own Play app's internal
  testing (no tickbox needed), so it updates on the owner's phone through
  Play. Builds of `main` only publish when asked, as before.
- **Updating screen.** After **Update now**, a full-screen updating screen
  replaces the slim download bar: gears turning, with a new teal gear
  rolling along the progress track as the update downloads (the real
  percentage), then the old gear drops out and the new one lifts into its
  place while it installs, and Play restarts the app into the new version
  on its own (no Restart button to tap). Android back doesn't close it.
- **Two corrective action wording fixes.** The sprinkler stop valve sign
  now cites AS 2118.1 (not AS 1670.1), and a note about detector
  **spacing** now asks for the original installer's certificate and DA
  approvals instead of "install additional smoke detectors" (a room with
  no detector still gets that).
- **Corrective actions learnt from the Strawberry Hills Hotel report.**
  12 new defects with EnFact's own wording from that report (extinguisher
  obstructed, sprinkler stop valve sign, sprinkler not maintained, flow
  test, 24 yearly head test, plant room storage, gas cylinders, external
  gong, AFSS on display out of date, electrical cupboard smoke seals, 5
  yearly SPL test, limited emergency lighting). Also fixed: "lack of exit
  signage" no longer gets the "not illuminated" wording, a sign that
  "does not indicate towards" the exit gets the wrong-direction wording,
  "does not drive open" is read as an auto door failing, and a low BOW
  sound level gets the EWIS volume wording. The report is now a test.
- **Inspecta Test through Google Play.** Each build now also makes a Play
  bundle of the test app (Inspecta Test, which installs beside the real
  one), and a new **Publish Inspecta Test to my phone** option on Run
  workflow sends it to its own Play app's internal testing, where only the
  owner tests it. Coworkers' app is not touched.
- **Inspecta Test gets its own upload key.** Play won't accept the real
  app's signing key for a second app, so Inspecta Test is signed with its
  own key when the TEST_KEYSTORE_BASE64 / TEST_KEYSTORE_PASSWORD secrets
  are set (and like the real app until then).
- **Rectified findings are closed in Excel.** Their Status / Date Closed
  shows the inspection date instead of "Open", and they get no suggested
  corrective action. Outstanding findings stay Open and keep theirs.
- **No more purple Ref cell in Excel.** A Ref kept from an old report
  (a number at the start of the note) is no longer tinted purple; the
  Rectified / Outstanding word under the Ref and the Risk Level colour
  show it instead.
- **Outstanding defect type (AFSS only).** The defect type picker now ends
  with a **From a previous inspection** heading holding **Rectified** and a
  new **Outstanding** (purple), for items raised at an earlier inspection
  that are fixed or still not fixed. Neither is offered on Projects sites.
  In the AFSS Excel, the Ref cell of these findings now shows the word
  **Rectified** (blue) or **Outstanding** (purple) in bold under the ref.
- **New loading animations.** The plain progress ring is replaced with a
  picture for each job, moving with the real progress: fire-safety kit
  (extinguisher, EXIT sign, sprinkler, fire door) riding a conveyor into a
  report for **PDFs**, a spreadsheet filling in row by row for **Excel**,
  photos dropping into a pouch that zips shut for the **photos zip**
  (counting the photos), and sites, findings and photos packed into a box
  that's taped shut for **backups**. Restoring a backup keeps the ring.
- **Confidence on each suggested corrective action.** Every red
  suggestion in the Excel now starts with a bold **Confidence: High /
  Medium / Low** line. High: the note itself names both the thing and the
  problem, under a specific ESR item, and nothing else matched. Low: the
  note only names the problem and the ESR category supplied the rest.
  Medium: in between, or a second common defect also fitted. Check the
  Lows first.
- **Corrective action prefill: correct or blank.** After a real report
  where half the red suggestions were wrong, the prefill now only fills in
  when the finding is filed under an ESR category that defect belongs to
  (uncategorised findings stay blank), no longer guesses at typos (it had
  read "point" as "paint"), and no longer lets the category stand in for
  the key words. It also knows EnFact shorthand like POT and EEL, and has
  EnFact's wording for awnings 2.5 m or wider without sprinkler coverage.
  On that report: the 5 wrong suggestions are gone (4 now blank, the
  awning one now correct), the 5 correct ones stay.
- **Updates show straight away.** After an update (the **Restart** button,
  or just reopening the app) the new version now appears immediately,
  without having to swipe the app out of the recent-apps tray. The cause
  was the web version's offline cache, which the Android app didn't need
  but was still using, so it kept showing the previous version's screens.
  It's now switched off and cleared inside the app (the web version keeps
  it). The first time the updated app opens it may flash and reload once
  while it clears the old copy.
- **Projects reports.** Sites created as Projects no longer use ESR
  categories: no category box on the finding screen, no category tag in
  the findings list, and no "Categorise now" prompt when exporting. Their
  reports list findings in the order the photos were taken (a note-only
  finding goes by when it was written), with no section headings. The
  Excel is a simple register: **Photo · Location · Notes · Date · Risk
  level**, the photos first (several stacked in one cell) and the date with
  the time the photo was taken. AFSS sites and reports are unchanged.

## 29 September 2026

- **Test versions are labelled.** An app built from any branch other than
  `main` (now the `test` branch) shows a **Test version** tag at the top
  of the splash screen and "Test version" after the build number in
  Settings. Builds from `main` look exactly as before.
- **Corrective actions pre-filled in the Excel.** When a finding's note is
  clearly one of EnFact's 65 common defects (e.g. "fire door held open with
  a wedge", "exit sign not illuminated"), the Excel register's Corrective
  Action column gets that defect's standard report wording, in red so it's
  checked before the report goes out. Unclear or unusual findings stay
  blank. Nothing changes in the app or the PDF. The list is fixed for now.
- **New splash screen (Build 4).** The EnFact swoosh draws itself with a
  teal shine on its leading edge, the letters bounce up as it lands and
  the shine carries across them; then "Inspecta" flickers on like a neon
  sign and cools to white while "Site inspection tool" fades in at the
  bottom. About three seconds, over a faint blueprint grid, then it fades
  into the app as before. Settings now shows **Build 4**.
- **First-time tour.** Everyone gets a welcome once (new users after
  entering their name, people already using the app on the first opening
  after this update) and can take a one-minute tour: the screen dims and one button at a time
  is lit up with a tip, moving screen to screen on Next (new site, new
  finding with camera / pen, Save & next, ESR category and "no rush",
  export, Settings). It runs on a temporary Example site that's removed
  at the end. Settings has **Replay tour**.
- **Tour wording.** The ESR tip now says "suggests the category it fits"
  (was "ESR item").

## 28 September 2026

- **Notepad removed.** The Notepad row and page are gone again; note-only
  findings (the pen button) cover the same need. Anything already typed
  into a Notepad stays in the phone's data and backups, just not shown.
- **Update popup.** When a new version is out on Google Play, Inspecta
  says so when it opens: **Update now** downloads it in the background
  (a small bar shows progress, keep working), then **Restart** switches to
  it in a few seconds. **Later** asks again next time the app opens.
  Settings has a **Check for updates** row too. Only in the app installed
  from Play. This version itself still arrives the old way, through the
  Play Store.
- **Notepad for each site.** A Notepad row sits at the top of every site's
  findings. It opens a blank page for your own jottings (things to check
  later, FER notes), saved as you type. It's never in the PDF, Excel or
  photos zip, but it is kept in backups with the site.
- **Build 3.** The first build sent to coworkers through Google Play
  (Settings shows "Inspecta · Build 3").
- **Google Play set-up (for automatic updates).** The APK build now also
  makes the file Google Play needs, and has a **Publish to coworkers** tick
  box that sends the build to the Play internal testing track, so Play
  updates everyone's phone. Plus a one-off option to hand Play the app's
  existing signing key, so the Play version installs over the current app
  and keeps its data.
- **New app icon.** The new Inspecta by Enfact icon (building and tick) on
  the phone's home screen, in the app's header and for the web version.
  The test app uses the same icon on orange.
- **Photos from the gallery.** On a finding, a new picture tile after the
  dashed **+** opens the phone's photo picker: pick one or several and
  they're added after the finding's other photos. A finding with no photo
  yet has a **Choose from gallery** button on its empty photo box. Gallery
  photos are stamped with the date and time they were taken (from the
  photo), or the time they were added if the phone can't tell.
- **+ and gallery always in reach.** With lots of photos the thumbnails
  scroll sideways, fading at the edge, while the + and gallery tiles stay
  pinned on the right.
- **Findings without a photo.** "Save & next finding" and "+ New finding"
  are now split: the small pen part on the left starts the next finding
  with no photo (no camera, keyboard up on the Note, level carried over
  as usual); the camera part works as before. A photo can still be added
  later from the photo box. A finding left completely empty (no photo,
  note, location, type or category) isn't kept, so a stray tap on the
  pen leaves nothing behind.
- **Full-screen photos.** On a finding, tap the big photo to see it full
  screen on black, with the note and location. Swipe sideways for the
  finding's other photos, pinch or double-tap to zoom, tap once to hide
  the buttons. Drag it down (or up), tap ✕ or press Android back to close
  it; it shrinks back into its spot. Adding another photo is now only the
  dashed **+** tile (a finding with no photo still opens the camera from
  the photo area).

## 25 September 2026

- **"Skip tests" option for APK builds.** Actions → Build Android APK →
  Run workflow now has a **Skip tests** tick box (off by default) to
  build without waiting for, or being stopped by, the tests.
- **Backup and restore.** Settings → **Back up all data** saves every
  site, finding and photo in one file to share (e.g. to OneDrive).
  **Restore from backup** adds the sites from a backup file, for a new
  phone or to hand a site to a coworker. Sites already on the phone are
  never overwritten or duplicated.
- **Storage kept safe.** The app asks Android to keep its data instead of
  clearing it when the phone runs low on space.
- **Build number in Settings.** "Inspecta · Build 2" at the bottom of
  Settings (also the Android version name). It only changes when a build
  is handed out.
- **Automated tests in the project.** The checks run before each change
  (suggestions, reports, Categorise, admin, backup, upgrades) now live
  in the repo and run on GitHub on every push; the APK build only
  happens if they pass.
- **"‹ Previous" on the Categorise screen.** A mis-tap moves straight on,
  so you can now step back through the findings you've been through.
  The earlier finding shows "You picked …" with that category
  highlighted: tap another to change it (what was learnt from the wrong
  pick is taken back), or "Keep & next". A skipped one says so and can
  be picked or skipped again.
- **Old numbers tinted purple in Excel.** A Ref kept from an old report
  (e.g. 1.8.3 from a note "1.8.3 still present") has its cell filled
  pale purple, so carried-over defects stand out.
- **Old report numbers recognised.** A note like "1.8.1 still present"
  suggests 1.8 first (read level by level: 6.3.4.2 → 6.3.4, 1.10.3 →
  1.10, 13.2 → 13). It counts at the start of a note, or anywhere with
  three or more parts; measurements like "2.4 m high" are ignored.
- **Old numbers kept in the report.** In the Excel, a finding whose note
  starts with its old number keeps it as its Ref (e.g. 1.8.3), listed
  first; new findings in that category count on after it (1.8.4…).
- **Excel Ref aligned top-left** in finding rows.
- **Admin → Learned keywords.** Shows the words this phone has learned
  from your category picks and where each points, with how many picks.
  Remove a wrong one, turn a good one into a proper keyword ("Make
  keyword"), or forget everything learned.
- **Mis-taps aren't learned.** Changing or clearing a category takes back
  what was learned from the earlier pick.
- **6.3 shown as context when picking.** In Quick add, the Categorise
  screen and Browse all, 6.3.1–6.3.4 now sit under a light-yellow
  "6.3 Fire control operation…" label (not a button), indented, like
  the yellow row in the reports. The picked category card also shows
  the 6.3 line in yellow under the section.
- **1.4 full name.** "Penetrations to fire resisting elements" now reads
  in full as on the company ESR list ("…(includes fire walls; smoke
  walls; …access panels and control joints)"), in the app and reports.
- **Yellow 6.3 row in reports.** Like the company spreadsheet, findings in
  6.3.1–6.3.4 now sit under a light yellow "6.3 Fire control operation…"
  row between the blue 6 and the grey sub-categories, in Excel, the PDF
  and the export preview.
- **6.3 is a heading only.** It can't be picked any more (it only holds
  6.3.1–6.3.4); in Browse all it shows as a label above them. Its
  keywords ("fire mode", "HVAC", "air conditioning"…) now suggest 6.3.1
  (and 6.3.2 weakly). The rule throughout: findings go under grey rows,
  or straight under a blue row that has no grey rows (4, 12, 13).
- **"4.1 General" removed.** Emergency Lighting has no sub-categories
  now: its findings go straight under the blue "4 Emergency Lighting"
  row, like 12 and 13. Findings already tagged 4.1 move to 4
  automatically when the app updates, and so do keyword changes and what
  the phone has learnt.
- **Fix: admin keyword changes now survive closing the app.** They were
  being lost on every restart (only the current session kept them).
- **Sprinkler suggestions favour 5.6.** "Sprinkler" and "bulb" are now
  only weak hints for 1.10 Wall wetting sprinklers, so 5.6 Fire
  Sprinkler Systems comes first. Notes that say "wall wetting" (or
  "drencher") still suggest 1.10 first.
- **Keyword changes from the admin file built in.** 1.10 Wall wetting
  sprinklers gains "sprinkler" and "bulb"; 5.6 Fire Sprinkler Systems
  gains "bulb" and the weak hint "concealed". A phone that already has
  these as its own changes counts them once.
- **Master recovery code for the admin PIN.** "Forgot PIN?" now also
  accepts a master code that works on every phone with no setup, so a
  forgotten PIN no longer needs the per-phone code emailed beforehand.
  The code itself isn't in the app (only a scrambled fingerprint of it),
  so it can't be read out; the owner keeps it. The emailed per-phone code
  still works too.
- **ESR category "Quick add" box.** On the finding screen the category now
  starts as one closed box, "Quick add". Tap it to drop down the
  suggestions (same as before); tap it again to fold them away. Picking
  closes it and shows the picked category; "Change" opens the list with
  the box reading "Change category" (tap it to cancel). The Categorise
  screen at export is unchanged.
- **"Decal" keyword.** Suggests 3.1 Illuminated exit signs first, then
  4.1 Emergency Lighting.
- **Admin menu (Settings → Admin).** PIN protected (starts as 2021).
  - **ESR keywords:** every category with its keywords, searchable. Add
    a keyword as near-certain, normal or a weak hint, or remove one;
    your changes show in teal and the category is marked EDITED. "Try
    it" shows the top 5 for a sample note as you edit.
  - **Test a note:** the top 5 for any note, with the keywords that
    matched and their scores.
  - **Share keyword changes / Load keyword file:** send your changes as
    a small file and load it on another phone (it replaces that phone's
    changes), or send it to have them built into the app.
  - **Change PIN.** **Email recovery code:** sends yourself a code (via
    the share menu); "Forgot PIN?" on the PIN screen takes it and lets
    you choose a new PIN. Email it to yourself once on each phone.
  - **Reset keywords:** back to the built-in list.
  - Keyword changes apply to that phone only, on top of what each phone
    learns from its own picks.
- **More ESR shorthand.** "FHR" and "HR" now suggest 5.4 Fire hose reel
  systems first. "EEL" (emergency exit lighting) suggests 4.1 Emergency
  Lighting first, then 3.1 Illuminated exit signs.
- **Findings without a photo are now in the PDF.** They used to be left
  out; now they appear like any other finding, with a dashed "No photo"
  box where the photos would go (the export preview shows the same).
  The Excel file already included them.
- **Test app ("Inspecta Test").** Every GitHub Actions build now makes a
  second APK, `inspecta-test-apk`, next to the normal one. It installs
  beside the real Inspecta instead of replacing it, with an orange icon
  and the name "Inspecta Test", and keeps its own sites and findings, so
  testing never touches real inspections. It starts empty.
- **ESR category fixes.**
  - Long category names now wrap onto more lines instead of being cut
    off, in the suggestions, the picked category and Browse all.
  - The Android back button works as it did before categories: one
    press saves the finding and goes to the list, even with the
    category list open (it just closes). With the export popup open,
    back goes to the findings list.
- **ESR categories (Advanced).** Findings can now be tagged with an ESR
  category from the company list (13 sections, e.g. "1.6 Fire Doors").
  - **On the finding screen**, at the bottom: as you type the note, the 5
    most likely categories appear, grouped under their section in grey.
    Tap one to pick it. ✕ clears it, "Change" shows the suggestions
    again, and "Browse all categories" opens the full list with a search
    box. It's optional: anything not picked is Uncategorised. It doesn't
    carry over to the next finding.
  - **Suggestions** work offline, with no AI service. They come from
    keywords for every item ("extinguisher" → 5.5, "damper" → 6.3.4,
    "EWIS" → 8.1…), cope with plurals and small typos, and learn from
    your picks, so your own shorthand ranks your usual choice first.
  - **The findings list** shows a small category number on each row.
    The list's order doesn't change.
  - **Before a PDF or Excel export**, if any findings are uncategorised, a
    popup offers **Categorise now** or **Export anyway**. Categorise now
    goes through them one at a time with their suggestions. **Skip
    finding** leaves one for later; skipped ones come round again, in
    yellow, until they're done or you tap **Skip to export**.
  - **PDF, Excel and the export preview** group findings under a blue
    heading per section and a grey one per item, in the list's order,
    with Uncategorised last. Similar findings (e.g. "Exit sign not
    illuminated" ×3) sit together. Excel's Ref column reads 1.6.1,
    1.6.2… Only sections with findings appear.
  - **Unchanged:** sites with no categories export exactly as before,
    and the photos zip stays the same.
  - **Android back button:** it now also closes the category list, and
    the export popup, first.
- **Project tidy-up before merging to main.**
  - Removed an unused leftover file (`public/icons.svg`, template social
    icons).
  - Made internal-only code names private.
  - Added a `.gitignore` so build folders (`node_modules`, `dist`) no
    longer show up as changes.
  - No change to how the app works: the full test run (13 areas)
    passes.
- **Changelog added.** This file: plain-English notes for every change
  from now on.
- **"Save & close" button.** The finding screen's left button, which
  used to say "View findings", now says what it does: it saves the
  finding and goes back to the list.
- **Android back button fixed.** Back now goes up the app instead of
  through history: finding → findings list → dashboard → close the app.
  It no longer drops you into old findings. Back from a finding also
  **saves it first**. Before, it lost anything you'd just typed. With
  the defect type picker open, back just closes the picker.
- **Site thumbnails.** Each site on the dashboard shows its first
  finding's photo instead of the building icon. Sites with no photos
  keep the icon.
- **Location suggestions.** While typing a location, up to 3 buttons
  suggest locations already used on the same site, filtered as you
  type. Tap one to fill it in. Works in regular and Advanced mode.
- **"Rectified" defect type.** A sixth defect type in light blue
  (`#00B0F0`), shown in the app, PDF and Excel. Defect bubbles also got
  a little extra word spacing so "Note only" reads as two words.

## 24 September 2026

- **Advanced mode on by default.** New installs start with it on. Anyone
  who has turned it off keeps it off.
- **Dashboard title.** "Inspecta" is now as tall as the logo icon, with
  the small teal "BY ENFACT" beside it.
- **Font bundled with the app.** Manrope used to load from the internet,
  so offline on site the app and photo stamps fell back to the phone's
  default font. It's now built in.
- **Settings gear.** The dashboard's initials button is now a gear icon.
  It opens Settings as before.
- **Swipe to delete findings.** Like sites: swipe a finding left, tap the
  bin, confirm. The red delete panel behind site and finding rows no
  longer peeks out while the list animates in.
- **Send Photos Only.** A new export button: every photo on the site at
  full resolution, time-stamped, in one zip named after the site, with
  a site-named folder inside. Files are named
  `01 - Level 25 - Kitchen.jpg`. Share it to OneDrive, then Extract All
  on the laptop.
- **Speed and memory.**
  - The findings list and photo strip use small saved thumbnails.
  - The export preview uses small copies.
  - PDF and Excel photos are capped at 1600 px, so files are about 3×
    smaller and exports use about 5× less memory.
  - The PDF and Excel tools only load when you open the Export screen.
- **Tidy-up.** Removed unused images and a package. The logo images are
  much smaller, so the app starts faster. The README is updated.
- **Keyboard.** The field you're typing in always stays visible above the
  keyboard, including the Level box and its buttons.
- **Progress ring.** A loading ring with a percentage while the PDF,
  Excel file or photos zip is prepared.
- **Photo timestamps.** Larger (matched to the supplied mockup), time
  then date (`02:52 AM - 24/09/26`), and never cut off in the PDF.
- **Defect colours.** Now Excel's standard Red, Gold, Green and Light
  Green.
- **Fixes.**
  - Defect type opens on the first tap.
  - The thumbnail row is no longer squashed.
  - Excel photos are the right way up and have timestamps.
- **Report dates.** The PDF cover and the Excel "Date identified" use the
  day the findings were entered.
- **Excel export.** Fills the company findings template: location,
  description with 5 cm photos, date, colour-filled risk level, and
  status "Open".
- **Level field (Advanced).** Type `25` for "Level 25", −/+ buttons, and
  quick buttons for Ground, Basement, Mezzanine and Roof. It carries over
  to the next finding; ✕ clears it.
- **Defect type (Advanced).** Optional colour-coded defect type on each
  finding, shown in the list, PDF and Excel.
- **Settings menu and Advanced controls switch.**
