// ESR (Essential Safety Requirements) categories, in the company's
// spreadsheet order and wording. A finding stores just the item's code
// ("1.6"); no code means Uncategorised.
//
// Every line is pickable except a section that has items under it (pick
// one of its items instead): so "1.6", "6.3" and "6.3.4" are, "1" isn't,
// and sections with no items of their own ("12", "13") are.
//
// `keywords` drive the suggestions on the finding screen (see
// esrSuggest.ts). A phrase counts for more than a single word; a leading
// "~" marks a weak hint (a word that's common across several items) and
// "!" a near-certain one ("penetration" is 1.4 whatever else is said).

export interface EsrItem {
  code: string;
  name: string;
  keywords: string[];
}

interface EsrSection extends EsrItem {
  items: EsrItem[];
}

const item = (code: string, name: string, keywords: string[] = []): EsrItem => ({ code, name, keywords });
const section = (code: string, name: string, items: EsrItem[], keywords: string[] = []): EsrSection => ({ code, name, keywords, items });

export const ESR_SECTIONS: EsrSection[] = [
  section("1", "Structure Fire Protection and Compartmentation", [
    item("1.1", "Fire resisting elements, including walls, columns, beams, floors, ceilings and shafts", [
      "fire resisting", "~fire rated", "frl", "fire rating", "~column", "~beam", "~shaft", "riser shaft", "~slab", "~ceiling", "~wall",
    ]),
    item("1.2", "Fire protective coverings and fire resistant materials applied to building elements", [
      "fire spray", "fire protective", "protective covering", "vermiculite", "intumescent paint", "fire grade plasterboard", "fyrchek", "~plasterboard", "~boxing", "~spray",
    ]),
    item("1.3", "Required non-combustible elements", [
      "non combustible", "noncombustible", "combustible", "aluminium composite", "acp", "~cladding", "~timber",
    ]),
    item("1.4", "Penetrations to fire resisting elements (includes fire walls; smoke walls; and fire resistant elements such as walls, floors, ceilings, protective coverings, access panels and control joints)", [
      "!penetration", "unsealed", "fire collar", "collar", "fire sealant", "sealant", "mastic", "fire batt", "batt", "fire pillow", "fire wrap", "access panel", "control joint",
      "~pipe", "~cable", "~conduit", "~hole", "~gap", "~void", "~seal", "~mortar",
    ]),
    item("1.5", "Compartmentation including fire walls, smoke walls, smoke lobbies, lightweight construction and bounding construction", [
      "compartment", "compartmentation", "fire wall", "smoke wall", "smoke lobby", "bounding construction", "lightweight construction", "~lobby",
    ]),
    item("1.6", "Fire Doors", [
      "fire door", "fire rated door", "door closer", "closer", "door seal", "smoke seal", "intumescent strip", "self closing", "door tag", "compliance tag", "door frame",
      "held open", "propped open", "wedge", "door gap", "~hinge", "~door", "~tag", "~frame",
    ]),
    item("1.7", "Smoke doors", ["smoke door", "smoke seal", "door closer", "self closing", "~closer", "~door"]),
    item("1.8", "Solid core doors", ["solid core", "sou door", "sole occupancy", "unit entry door", "apartment door", "entry door", "~door"]),
    item("1.9", "Fire hazard properties of material", ["fire hazard", "hazard properties", "floor covering", "wall lining", "ceiling lining", "flammability", "~carpet", "~lining", "~curtain"]),
    item("1.10", "Wall wetting sprinklers", ["!wall wetting", "drencher", "window sprinkler", "~sprinkler", "~bulb", "~drench"]),
  ]),
  section("2", "Means of Egress", [
    item("2.1", "Doors in required exits", ["exit door", "egress door", "required exit", "door swing", "final exit", "exit doorway", "~exit", "~door"]),
    item("2.2", "Fire isolated stairways, ramps and passageways including handrails, balustrades and stair treads", [
      "fire stair", "fire isolated", "fire isolated stair", "fire isolated passageway", "fire escape", "stairwell", "stair tread", "~handrail", "~balustrade", "~nosing", "~passageway", "~stair",
    ]),
    item("2.3", "Non fire isolated stairways and ramps", ["non fire isolated", "stair", "staircase", "ramp", "~handrail", "~balustrade", "~nosing", "~tread"]),
    item("2.4", "Paths of travel to and discharge from exits", [
      "path of travel", "path of egress", "egress path", "exit path", "~discharge", "obstruct", "obstruction", "blocked", "trip hazard", "clear path", "~storage", "~stored", "~corridor", "~pallet", "~rubbish", "~bin", "~egress",
    ]),
    item("2.5", "Latches and automatic closing or unlocking devices on doors to required exits", [
      "latch", "lock", "deadlock", "snib", "panic bar", "push bar", "lever handle", "hold open", "magnetic hold", "maglock", "mag lock", "electric strike", "door release",
      "thumb turn", "thumbturn", "auto closing", "automatic closing", "~closer", "~key", "~release", "~handle",
    ]),
    item("2.6", "Artificial lighting required for egress", ["artificial light", "artificial lighting", "general lighting", "normal lighting", "lux", "~dark", "~lighting", "~light"]),
  ]),
  section("3", "Signs", [
    item("3.1", "Illuminated exit signs", ["!exit sign", "exit light", "eel", "!decal", "running man", "directional exit", "emergency exit sign", "illuminated exit", "~exit", "~pictogram", "~illuminated"]),
    item("3.2", "Signs concerning use of lifts in the event of fire", ["lift sign", "do not use lift", "lift fire sign", "in case of fire", "~lift", "~sign"]),
    item("3.3", "Signs on fire doors and smoke doors including re-entry from fire stairs and signs on egress doors leading from fire-isolated passageways", [
      "fire door sign", "smoke door sign", "door sign", "!re entry", "!reentry", "fire safety door", "do not obstruct", "offence sign", "warning sign", "~signage", "~sign",
    ]),
  ]),
  // no sub-items: findings go straight under the section (4.1 General was
  // removed — see RENAMED_CODES)
  section("4", "Emergency Lighting", [], [
    "!emergency light", "emergency lighting", "!eel", "emergency exit lighting", "decal", "emergency lamp", "emergency luminaire", "el", "spitfire", "twin spot", "discharge test", "emerg light", "~battery", "~batten", "~emerg",
  ]),
  section("5", "Fire-fighting Services and Equipment", [
    item("5.1", "Fire main, booster, static water supply and associated water supply equipment", [
      "booster", "fire main", "water tank", "fire tank", "static water", "water supply", "pump room", "fire pump", "jockey pump", "diesel pump", "block plan", "~tank", "~pump", "~valve", "~gauge", "~strainer",
    ]),
    item("5.2", "Fire hydrant system", ["!hydrant", "fire hydrant", "landing valve", "hydrant valve", "storz", "blank cap", "~coupling", "~valve"]),
    item("5.3", "Fire control room", ["fire control room", "fire control centre", "fire control center", "fcr", "fcc", "control room"]),
    item("5.4", "Fire hose reel systems", ["!hose reel", "hosereel", "!fhr", "!hr", "~hose", "~nozzle", "~reel"]),
    item("5.5", "Portable fire extinguishers", [
      "!extinguisher", "fire extinguisher", "fire blanket", "co2", "dcp", "dry chemical", "dry powder", "wet chemical", "afff", "service tag", "ext", "~blanket", "~bracket", "~foam", "~tag",
    ]),
    item("5.6", "Fire Sprinkler Systems", [
      "!sprinkler", "sprinkler head", "sprinkler valve", "valve set", "escutcheon", "deflector", "painted head", "flow switch", "bulb", "~head", "~clearance", "~concealed",
    ]),
  ]),
  section("6", "Air Handling Systems", [
    item("6.1", "Fans and fan motors associated with the operation of a ventilation system (frequency and emergency use)", [
      "fan", "fan motor", "exhaust fan", "supply fan", "smoke exhaust", "car park exhaust", "carpark exhaust", "ventilation", "vsd", "~exhaust", "~motor",
    ]),
    item("6.2", "Smoke Detectors (not forming part of an AS1670 system)", ["duct detector", "duct smoke detector", "air handling detector", "~smoke detector", "~detector"]),
    // a heading only (yellow in reports): findings go under 6.3.1–6.3.4
    item("6.3", "Fire control operation associated with mechanical ventilation of air conditioning systems"),
    item("6.3.1", "Fire alarm shut down of equipment", [
      "shut down", "shutdown", "plant shutdown", "ahu shutdown", "fire trip", "fire mode", "fire control operation", "mechanical ventilation", "air conditioning", "hvac", "~shut", "~mechanical", "~ahu",
    ]),
    item("6.3.2", "Control of supply and or return air", ["supply air", "return air", "outside air", "relief air", "~supply", "~return", "~air conditioning", "~hvac"]),
    item("6.3.3", "Fire mode operation of dampers for outside air, recycled air, relief air, zone control dampers for supply and return air including motorized fire/smoke/combination dampers", [
      "motorised damper", "motorized damper", "smoke damper", "combination damper", "zone damper", "relief damper", "damper actuator", "actuator", "~damper",
    ]),
    item("6.3.4", "Fire dampers", ["fire damper", "!damper", "fusible link", "damper access", "~access panel"]),
    item("6.4", "Egress Pressurization and /or zone (sandwich) pressurization", [
      "pressurisation", "pressurization", "stair pressurisation", "stair pressurization", "zone pressurisation", "sandwich", "pressurised", "pressurized", "~relief",
    ]),
  ]),
  section("7", "Automatic Fire Detection and Alarm systems", [
    item("7.1", "Self contained smoke and thermal alarms", ["smoke alarm", "self contained", "thermal alarm", "heat alarm", "240v", "chirping", "beeping", "~alarm"]),
    item("7.2", "Detection and alarm system", [
      "detector", "smoke detector", "heat detector", "thermal detector", "beam detector", "fire indicator panel", "fire panel", "fip", "manual call point", "mcp", "break glass",
      "strobe", "sounder", "vesda", "asd", "as1670", "detection", "~isolated", "~fault", "~zone", "~panel",
    ]),
  ]),
  section("8", "Occupant Warning System", [
    item("8.1", "Emergency Warning and Intercommunication System", [
      "ewis", "wip", "warden intercom", "warden intercommunication", "mecp", "master emergency control", "evacuation tone", "evac tone", "public address", "~speaker", "~warden", "~pa",
    ]),
    item("8.2", "Other Occupant Warning Systems", ["occupant warning", "ows", "alarm bell", "bell", "siren", "~sounder", "~tone"]),
  ]),
  section("9", "Interconnections - Fire Safety Systems", [
    item("9.1", "Fire Alarm Signal", ["alarm signal", "alarm signalling", "asb", "alarm monitoring", "monitoring", "monitored", "brigade", "dialler", "~signal"]),
    item("9.2", "Interconnection of System", ["interconnection", "interconnect", "interface", "interfaced", "interlock", "cause and effect", "bms", "~relay"]),
  ]),
  section("10", "Lifts", [
    item("10.1", "Stretcher facility", ["stretcher", "lift car size"]),
    item("10.2", "Emergency lifts operation", ["emergency lift", "fire service lift", "firemans switch", "fireman switch", "lift recall", "lift homing", "fire service control", "~lift", "~elevator"]),
    item("10.3", "Essential Maintenance", ["lift maintenance", "lift log", "lift logbook", "lift certificate", "lift service", "~maintenance"]),
  ]),
  section("11", "Building Clearance and Fire Appliance Access", [
    item("11.1", "Access for fire appliances", ["fire appliance", "appliance access", "fire truck", "fire brigade access", "hardstand", "vehicular access", "access road", "~driveway"]),
    item("11.2", "Clearance for large isolated buildings", ["large isolated", "perimeter access", "vehicular perimeter", "~clearance", "~perimeter"]),
  ]),
  section("12", "Emergency evacuation procedures", [], [
    "evacuation plan", "evacuation diagram", "evac plan", "evac diagram", "emergency plan", "emergency procedure", "evacuation procedure", "you are here", "assembly area",
    "assembly point", "fire drill", "emergency manual", "~evacuation", "~evac",
  ]),
  section("13", "Miscellaneous", [], ["logbook", "log book", "~records", "~certificate", "~miscellaneous"]),
];

// Codes that have been removed from the list, and what they became.
// Saved findings are moved over by a database upgrade (db.ts); keyword
// changes and learnt picks are moved as they're read.
export const RENAMED_CODES: Record<string, string> = { "4.1": "4" };

export function currentCode(code: string): string {
  return RENAMED_CODES[code] ?? code;
}

// Every line of the list, in order — including headings like 6.3 that
// hold other items
const ALL_LINES: EsrItem[] = ESR_SECTIONS.flatMap((s) => (s.items.length ? s.items : [s]));

const hasChildren = (code: string) => ALL_LINES.some((i) => i.code.startsWith(`${code}.`));

// Every pickable item, in list order (not headings like 6.3).
export const ESR_ITEMS: EsrItem[] = ALL_LINES.filter((i) => !hasChildren(i.code));

// a section's pickable items; a section with none is picked itself ("13")
export function sectionItems(s: EsrSection): EsrItem[] {
  return s.items.length ? s.items.filter((i) => !hasChildren(i.code)) : [s];
}

const byCode = new Map(ESR_ITEMS.map((i) => [i.code, i]));
const sectionByCode = new Map<string, EsrSection>();
for (const s of ESR_SECTIONS) {
  sectionByCode.set(s.code, s);
  for (const i of s.items) sectionByCode.set(i.code, s);
}
const listIndex = new Map(ALL_LINES.map((i, n) => [i.code, n]));

export function esrItem(code: string | undefined): EsrItem | undefined {
  return code ? byCode.get(code) : undefined;
}

// the section an item belongs to (a sub-item-less section is its own)
export function esrSection(code: string | undefined): EsrSection | undefined {
  return code ? sectionByCode.get(code) : undefined;
}

// an item with no items of its own under a section ("12", "13")
export function isSectionOnly(code: string): boolean {
  return sectionByCode.get(code)?.code === code;
}

// A heading inside a section holding items of its own ("6.3" over
// 6.3.1–6.3.4): reports show it as a yellow row between the blue section
// and the grey items. Returns it for a code under it.
export function esrGroup(code: string): EsrItem | undefined {
  return ALL_LINES.find((p) => code.startsWith(`${p.code}.`) && hasChildren(p.code));
}

// A reference number typed in a note, e.g. "1.8.1 still present" for a
// defect carried over from last year's report. Read level by level to the
// deepest pickable category: 1.8.1 → 1.8 (finding 1), 6.3.4.2 → 6.3.4,
// 1.10.3 → 1.10 (by dots, so not 1.1), 13.2 → 13. `ref` is the whole
// number when it goes past the category (a finding number, kept as the
// report's Ref). To avoid "2.5mm" style numbers, it only counts at the
// very start of the note, or anywhere with three or more parts.
export function noteReference(note: string): { code: string; ref?: string } | undefined {
  const candidates: string[] = [];
  // (not a measurement: "2.4 m high", "1.5 metres")
  const start = /^\s*(\d{1,2}(?:\.\d{1,3})+)(?![\w.])(?!\s*(?:mm|cm|m|metres?|meters?|kg|kpa|l|lt|litres?|%|x)\b)/i.exec(note);
  if (start) candidates.push(start[1]);
  for (const m of note.matchAll(/(?:^|[^\w.])(\d{1,2}(?:\.\d{1,3}){2,})(?![\w.])/g)) candidates.push(m[1]);
  for (const number of candidates) {
    const parts = number.split(".");
    for (let k = parts.length; k >= 1; k--) {
      const code = currentCode(parts.slice(0, k).join("."));
      if (!esrItem(code)) continue;
      return k < parts.length ? { code, ref: number } : { code };
    }
  }
  return undefined;
}

// position in the spreadsheet's order, for sorting; unknown codes last
export function esrOrder(code: string | undefined): number {
  return (code ? listIndex.get(code) : undefined) ?? Number.MAX_SAFE_INTEGER;
}
