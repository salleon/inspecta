import { test } from "node:test";
import assert from "node:assert/strict";

// Saved keyword changes must load when the app starts (a bug once lost
// them on every restart), including ones saved against a removed code.
test("saved keyword changes load at start-up, 4.1 moved to 4", async () => {
  localStorage.setItem("inspecta.esrKeywordEdits", JSON.stringify({ "4.1": { added: [{ text: "spit fire", kind: "" }], removed: [] } }));
  const kw = await import("../../src/lib/esrKeywords");
  assert.equal(kw.editedCount(), 1);
  assert.ok(kw.categoryKeywords("4").some((k) => k.text === "spit fire" && !k.builtIn));
});

test("an addition later built into the app counts once", async () => {
  const kw = await import("../../src/lib/esrKeywords");
  // a phone that added "bulb" to 5.6 before it was built in
  kw.applyKeywordFile({ "5.6": { added: [{ text: "bulb", kind: "" }], removed: [] } });
  assert.equal(kw.categoryKeywords("5.6").filter((k) => k.text === "bulb").length, 1);
});
