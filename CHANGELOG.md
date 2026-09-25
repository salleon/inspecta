# Changelog

Plain-English notes on what changed in the app, newest first. Each entry
matches a commit on the `advanced_controls` branch; the commit itself has
the technical detail.

## 25 September 2026

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
