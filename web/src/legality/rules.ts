// Codified dispersed-camping rules. These are the GENERAL federal rules — the
// app always tells the user to confirm the unit-specific order, because local
// forest/field-office closures override these and aren't in any live feed.
import type { Manager } from "../map/managers";

export interface ManagerRules {
  /** Is dispersed camping generally allowed on this manager's land? */
  allowed: "yes" | "restricted" | "no";
  stayLimit: string;
  rules: string[];
}

export const MANAGER_RULES: Record<Manager, ManagerRules> = {
  BLM: {
    allowed: "yes",
    stayLimit: "14 days within any 28-day period; then move ≥25 miles.",
    rules: [
      "Camp in already-disturbed sites — no new disturbance.",
      "Drive no more than ~300 ft (many field offices: 150 ft) from a designated route to a campsite.",
      "Pack out all waste; bury human waste 6–8 in, 200 ft from water.",
    ],
  },
  USFS: {
    allowed: "yes",
    stayLimit: "Typically 14 days; some forests vary (check the forest order).",
    rules: [
      "Camp within ~150 ft of a designated open route, in an existing site.",
      "Stay ≥100–200 ft from water sources, and ≥1 mile from developed campgrounds.",
      "Motorized access only on routes shown open on the Motor Vehicle Use Map.",
    ],
  },
  NPS: {
    allowed: "no",
    stayLimit: "—",
    rules: ["Dispersed roadside camping is prohibited in National Parks.", "Backcountry camping (if any) requires a permit in designated zones."],
  },
  USFWS: {
    allowed: "no",
    stayLimit: "—",
    rules: ["National Wildlife Refuges are generally closed to camping.", "Day-use and wildlife protection rules apply."],
  },
  STATE: {
    allowed: "restricted",
    stayLimit: "Varies by state agency.",
    rules: [
      "State trust / state land rules vary widely — many prohibit dispersed camping or require a permit.",
      "Verify with the specific state agency before camping.",
    ],
  },
  USBR: {
    allowed: "restricted",
    stayLimit: "Varies by project.",
    rules: ["Reclamation lands are often day-use or developed-only; verify locally."],
  },
  DOD: {
    allowed: "no",
    stayLimit: "—",
    rules: ["Military land — closed to public camping."],
  },
  TRIBAL: {
    allowed: "no",
    stayLimit: "—",
    rules: ["Tribal land — camping requires the tribe's permission and may need a permit."],
  },
  PRIVATE: {
    allowed: "no",
    stayLimit: "—",
    rules: ["Private or unmapped land — camping requires the landowner's permission."],
  },
  OTHER: {
    allowed: "restricted",
    stayLimit: "Varies.",
    rules: ["Managing agency unclear — verify access before camping."],
  },
};

/** The honest limits of any map, shown only where they actually bear on the point. */
const CLOSURES_CAVEAT =
  "Verify current closures & fire restrictions with the local ranger district — these change constantly and aren't in any live map.";
const WILDERNESS_CAVEAT = "Designated Wilderness prohibits motorized access even inside a National Forest.";
const LNT_CAVEAT = "Leave No Trace: use existing sites, pack out everything, follow campfire rules.";
const BOUNDARY_CAVEAT =
  "Ownership boundaries here are generalized for fast loading and can be off by a parcel, so confirm on the ground or with the managing agency.";

/**
 * A caveat repeated on every verdict stops being read. Show one only when it
 * changes what the reader should do here:
 *   - closures/LNT: only where camping is actually on the table
 *   - wilderness: only on USFS/BLM land NOT already ruled red for wilderness,
 *     i.e. exactly where an unmapped wilderness boundary could still bite
 *   - boundary: where the answer is "no", the only thing left to doubt is
 *     whether the polygon under your finger is the right one
 * Never returns an empty list: every verdict admits to something.
 */
export function caveatsFor(opts: { inWilderness?: boolean; manager: Manager | null }): string[] {
  const { inWilderness, manager } = opts;
  if (inWilderness) return [BOUNDARY_CAVEAT, LNT_CAVEAT];
  if (manager === null) return [BOUNDARY_CAVEAT];
  const allowed = MANAGER_RULES[manager].allowed;
  if (allowed === "no") return [BOUNDARY_CAVEAT];
  const out = [CLOSURES_CAVEAT];
  if (manager === "USFS" || manager === "BLM") out.push(WILDERNESS_CAVEAT);
  out.push(LNT_CAVEAT);
  return out;
}

/** A best-effort link to look up the governing unit's current rules. */
export function rangerLink(manager: Manager | null, forestName?: string | null): string {
  if (forestName) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${forestName} motor vehicle use map dispersed camping rules`)}`;
  }
  if (manager === "BLM") return "https://www.blm.gov/programs/recreation/camping";
  if (manager === "USFS") return "https://www.fs.usda.gov/visit/know-before-you-go";
  return "https://www.google.com/search?q=dispersed+camping+rules+public+land";
}
