# Inspecta: whole-app review, 10 November 2026

A list to work through one at a time. Tick an item off (or strike it) once it's decided.

**How this was done:** the app was run at phone size (390×844 and 320×568) with sample data, every main screen was captured and looked at, and the code was scanned for patterns. **Not checked:** a real phone, the camera, Mark up, the tour, the look of exported PDF and Excel files, backup and restore. Items marked *(seen)* were seen on screen; *(code)* come from reading the code; *(owner)* were added by the owner.

Already on your list, so not repeated below: cutting hint text (specific ones are in section D), and reworking the tour.

## A. Bugs and things that can lose work

- [x] **A1. One crash blanks the whole app.** Done 10 Nov: a "Something went wrong" screen with Try again and Back to home; a flow test with no supply left now opens with a blank one. *(seen)* There is no safety net: when a screen hits an error, every screen after it is blank until the app is force-closed. It happened here on a flow test that had no supplies. Fix: a "Something went wrong, back to home" screen, and guard that flow test case.
- [ ] **A2. Nothing protects the data on the phone.** Part done 10 Nov: the app asks the phone to keep its storage; a full phone gets a message; Settings shows when the last backup was made. Still open: whether and how to remind you to back up. *(code)* Everything lives only on the phone, but the app never asks the phone to keep its storage, doesn't handle a full phone, and never reminds you to back up or shows when you last did.
- [x] **A3. Stair: renaming or removing a level strands its readings.** Done 10 Nov: a renamed level takes its readings (and added doors) with it; removing a level with readings asks first. Still open: retyping a stair's Highest or Lowest level rebuilds the levels without checking for readings. *(code)* Readings are filed under the level's name, so changing P2 to B2 after testing hides what was recorded at P2. Fix: carry readings across on a rename, warn on a remove.
- [ ] **A4. Errors that vanish.** *(code)* 55 places swallow an error silently. Most are harmless, but saves and exports among them should at least tell you.
- [ ] **A5. Browser-style pop-ups for errors.** *(code)* Eight failures ("Couldn't export the PDF…") use the phone's plain alert box instead of the app's own dialog.
- [ ] **A6. Home: the + button covers the card under it on small phones.** *(seen)* It hides the date and count of the last visible site.
- [ ] **A7. Stair setup: the stair's number and its fan disagree.** *(seen)* A stair is titled "Stair 4" with "Fan SPF 3" under it. Title it by its fan or name.
- [ ] **A8. Stair pad: the < key looks like a back arrow.** *(seen)* It draws as a small "‹".
- [ ] **A9. Stair readings: the Open column is a dash on every row for Zone systems.** *(seen)* Hide it when there's nothing to show.
- [ ] **A10. General report: one extra door widens the whole table.** *(seen)* A stair with three doors on one level prints "SPF 1 A / B / C" columns that are blank everywhere else. Print the extra doors as extra rows.
- [ ] **A11. General testing gaps.** *(code)* Noise, restoration and pressure aren't per run. (Deleting a run: done 10 Nov, Delete run in the run's sheet.)
- [x] **A12. Stair testing: no way to delete a door on a level.** Done 10 Nov: Remove door in the pad's heading, for the last door added at a level. *(owner)* + Door adds one, but a door added by mistake can't be taken off that level. Today the only way is Remove on the stair's card in setup, which clears every added door on the stair.
- [x] **A13. Stair testing: a test added to a stair test can't be taken off.** Done 10 Nov: ✕ beside each test on the test page. *(code)* + Add (Door force, Noise…) on the test page and + Test on the readings screen add a section; there's no way to remove one added by mistake. It stays on the page and as blank columns on the report.
- [x] **A14. Stair testing: a Yes / No answer can't be cleared.** Done 10 Nov: ⌫ on the Yes / No pad. *(code)* Door closes & latches can be switched between Yes and No, but not set back to blank (not tested).
- [x] **A15. Stair testing: the phone meter's saved reference can't be cleared.** Done 10 Nov: tap Ref. … ✕ to clear it (not yet tried with a real microphone). *(code)* Save as ref. can be replaced by a new reading but not removed, and it prints on the report.

## B. Speed and fewer steps

- [ ] **B1. The splash holds for 2.9 seconds on every open.** *(code)* Cut to under a second, or show the long one only on first launch.
- [ ] **B2. Export loaders are held on screen for 3 to 4 seconds even when the file is ready.** *(code)* Four places. Drop the minimum to under a second.
- [ ] **B3. Unlabelled pencil buttons.** *(seen)* Findings has "✎ | New finding" and a finding has "Save & close | ✎ | Save & next". Nothing says what the pencil does. Label it or move it.
- [ ] **B4. Findings rows show a time but no date.** *(seen)* "06:46 AM" only. On a site visited over several days you can't tell the days apart. Show the date, or group by day.
- [ ] **B5. General system testing has two homes.** *(seen)* Start lands on the readings; Back goes to a page listing the same tests again. Make the readings screen the test, with Notes and the report reachable from it.
- [ ] **B6. "Flow testing mode" now also decides the stair test types.** *(code)* Rename it to something like "Mode: EnFact / Contractor".
- [ ] **B7. Two copies of the tests list.** *(code)* FlowTestList and TestsList do nearly the same job and will drift apart. Merge them.

## C. Layout

- [ ] **C1. Stair readings: five bands before the first row.** *(seen)* Stairs, runs, tests, the amber requirements box and the progress line take about 330 px. With the pad up, three or four levels are visible. Fold the requirements to one line (as the setup page does) and put progress on the stair card.
- [ ] **C2. Finding screen: the photo takes about 40% of the screen.** *(seen)* On a small phone only the first line of the defect shows above the buttons. Shrink the photo on short screens or while typing.
- [ ] **C3. Stair cards run off the edge with no cue.** *(seen)* The fourth card is cut mid-word and the group name is tiny.
- [ ] **C4. Stair setup card is seven fields long.** *(seen)* Name, Highest, Lowest, Fan, Group, Doors, Review. Put Fan first (it's how you name stairs) and pair up the short ones.
- [ ] **C5. Flow test is one very long scroll.** *(seen)* Details, demand points, graph, supply, readings. The graph is above the readings, so you can't see it change as you type.
- [ ] **C6. Empty screens are one grey line and a lot of nothing.** *(seen)* "No flow tests on this site yet." at the top, the button at the very bottom. Use the "No stairs yet" pattern: icon, line, button together.
- [ ] **C7. Review level layout: a closed group leaves a large empty box.** *(seen)* With one group (a tower), the screen is a single bar and blank space.
- [ ] **C8. Too many text sizes, and some too small.** *(code)* 26 different sizes are in use, and about 50 places are under 11 px. Settle on five or six, with 12 px the smallest on screen.
- [ ] **C9. Too many colours.** *(code)* 113 different colour values. Reduce to a named palette so teal, purple, amber and the greys are the same everywhere.
- [ ] **C10. Small tap targets.** *(seen)* + Door, the edit pencils in headers and list rows, the ✕ on demand rows, text links like Remove. Aim for 44 px.
- [ ] **C11. Headers don't match.** *(seen)* Findings and site screens centre the title; Settings, Finding and the stair screens left-align it, at different sizes.
- [ ] **C12. Home cards: three small right-hand items.** *(seen)* Tag, date and count stack at 10 to 11 px, and a long site name wraps to three lines on a small phone.

- [ ] **C13. Carry the opening screen's texture through to the site screen?** *(owner, a maybe)* The grid texture behind the home screen stops at the site screens, which are flat navy. Try it on the site screen and see if it reads as one app or gets in the way of the lists.

## D. Wording and consistency

- [ ] **D1. Hint text to cut or keep.** *(seen)* Found so far: "Swipe a test left to delete it."; "More tests will be added here."; "Each test is one page in the PDF and one sheet in the Excel."; "Save backups to OneDrive or similar…"; "Set to Annual Testing for the AFSS; change it to…"; "Add readings and demand points to compare"; the same "One tab per supply (town main, electric, diesel…); + adds more" under both Sprinkler and Hydrant; nine "e.g. …" placeholders. Worth a pass that lists every one for a keep or cut.
- [ ] **D2. Three words for the same action.** *(seen)* Share PDF / Share Excel / Send Photos Only, Export Excel / Export PDF, Export Other Tests Only.
- [ ] **D3. Capitals.** *(seen)* "Create Customised Report", "Send Photos Only" and "Export Other Tests Only" are title case; the rest of the app is sentence case.
- [ ] **D4. Five date formats.** *(code)* 10 Nov 2026, 10 November 2026, 10/11/2026 and others. One for screens, one for reports.

## E. Polish

- [ ] **E1. Report previews can't be zoomed.** *(code)* Zoom is off app-wide and the stair report preview uses 7.5 to 9 px text.
- [ ] **E2. Built Android files are committed to the repo.** *(code)* 37 generated files, already out of date. They add noise to every search and review.
- [ ] **E3. iPhone checks to do on a device.** Safe areas around the number pads and bottom buttons, the back gesture, and the volume-key shutter (Android only today).
