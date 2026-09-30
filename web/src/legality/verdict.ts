import type { Manager } from "../map/managers";
import { MANAGERS } from "../map/managers";
import { MANAGER_RULES, caveatsFor, rangerLink } from "./rules";
import { OWNERSHIP_ATTRIBUTION } from "../map/dataSources";
import { bestSeason, type SeasonStatus } from "./season";

export type VerdictLevel = "green" | "yellow" | "red" | "unknown";

export interface NearestRoute {
  name: string;
  routeId?: string;
  distMeters: number;
  forest?: string | null;
  district?: string | null;
  openToPassenger: boolean;
  openToHighClearance: boolean;
  /** seasonOn(passengervehicle_datesopen, today). */
  passengerSeason?: SeasonStatus;
  /** seasonOn(highclearancevehicle_datesopen, today). */
  highClearanceSeason?: SeasonStatus;
  isTrail: boolean;
  /** A BLM GTLF route: its season is blmSeason()'s yes/no flag, not MVUM dates. */
  isBlm?: boolean;
  /** The BLM's free-text note on the route's limits (OHV_DSGNTN_LIM_EXPLAIN), quoted as written. */
  seasonNote?: string | null;
}

export interface VerdictInput {
  lngLat: { lng: number; lat: number };
  manager: Manager | null;
  unitName?: string | null;
  /** True if the ownership layer actually had data loaded at this point. */
  ownershipLoaded: boolean;
  nearestRoute: NearestRoute | null;
  inWilderness?: boolean;
  wildernessName?: string | null;
}

export interface Verdict {
  level: VerdictLevel;
  title: string;
  subtitle: string;
  manager: Manager | null;
  unitName?: string | null;
  nearestRoute: NearestRoute | null;
  reasons: string[];
  rules: string[];
  stayLimit?: string;
  caveats: string[];
  /** Which dataset this verdict read, so the reader can go check its vintage. */
  sourceNote?: string;
  rangerLink: string;
  lngLat: { lng: number; lat: number };
}

const CORRIDOR_M = 91; // ~300 ft typical motorized dispersed-camping corridor
const NEAR_M = 400; // "near a route but maybe outside the corridor"

const metersToFeet = (m: number) => Math.round(m * 3.28084);

export function computeVerdict(input: VerdictInput): Verdict {
  const { lngLat, manager, unitName, ownershipLoaded, nearestRoute, inWilderness, wildernessName } = input;
  const base = {
    manager,
    unitName,
    nearestRoute,
    caveats: caveatsFor({ inWilderness, manager }),
    rangerLink: rangerLink(manager, nearestRoute?.forest ?? unitName),
    sourceNote: ownershipLoaded ? OWNERSHIP_ATTRIBUTION : undefined,
    lngLat,
  };

  // Designated Wilderness overrides everything — no motorized or dispersed access.
  if (inWilderness) {
    return {
      ...base,
      level: "red",
      title: "Wilderness — no vehicle camping",
      subtitle: wildernessName ?? "Designated Wilderness",
      reasons: [
        "This point is inside designated Wilderness. Motorized and mechanized travel are prohibited, so motorized dispersed camping is not allowed here.",
        "Foot/horseback backcountry camping may be permitted under the managing unit's rules and permits.",
      ],
      rules: ["No motor vehicles, e-bikes, or mechanized equipment.", "Check the managing unit for permits/quotas and camp-setback rules."],
    };
  }

  if (!ownershipLoaded) {
    return {
      ...base,
      level: "unknown",
      title: "Zoom in to check",
      subtitle: "Land-ownership data loads at higher zoom.",
      reasons: ["Public-land boundaries aren't loaded at this zoom level. Zoom in and tap again."],
      rules: [],
    };
  }

  if (manager === null) {
    return {
      ...base,
      level: "red",
      title: "Private or unmapped",
      subtitle: "No public-land boundary here",
      reasons: ["No public-land boundary was found at this point — it's most likely private land. Camping requires the owner's permission."],
      rules: MANAGER_RULES.PRIVATE.rules,
    };
  }

  const info = MANAGERS[manager];
  const mr = MANAGER_RULES[manager];
  const unit = unitName ? `${info.fullName} — ${unitName}` : info.fullName;

  // Hard "no" managers
  if (mr.allowed === "no") {
    return {
      ...base,
      level: "red",
      title: `${info.label} — no dispersed camping`,
      subtitle: unit,
      reasons: [`This point is on ${info.fullName} land, where dispersed camping is generally prohibited.`],
      rules: mr.rules,
      stayLimit: mr.stayLimit !== "—" ? mr.stayLimit : undefined,
    };
  }

  // Restricted managers (State, Reclamation, Other)
  if (mr.allowed === "restricted") {
    return {
      ...base,
      level: "yellow",
      title: `${info.label} — rules vary`,
      subtitle: unit,
      reasons: [`On ${info.fullName} land. Dispersed camping is not guaranteed here — many such areas prohibit it or require a permit.`],
      rules: mr.rules,
      stayLimit: mr.stayLimit !== "—" ? mr.stayLimit : undefined,
    };
  }

  // BLM / USFS — the green/yellow corridor logic
  const reasons: string[] = [`On ${info.fullName} land${unitName ? ` (${unitName})` : ""}, where dispersed camping is generally allowed.`];

  // The corridor rule needs the route OPEN today, per vehicle class. A class
  // with no season sent counts as in season.
  // only BLM GTLF routes the BLM does not flag as seasonal arrive without
  // one. A flagged BLM route sends unknown; every MVUM route sends open, closed or unknown.
  const inCorridor = nearestRoute !== null && nearestRoute.distMeters <= CORRIDOR_M;
  const passSeason = inCorridor && nearestRoute.openToPassenger ? (nearestRoute.passengerSeason ?? "open") : null;
  const hcSeason = inCorridor && nearestRoute.openToHighClearance ? (nearestRoute.highClearanceSeason ?? "open") : null;
  const season = bestSeason([passSeason, hcSeason]);

  if (inCorridor && season === "open") {
    const vClass = passSeason === "open" ? "all vehicles" : "high-clearance vehicles";
    reasons.push(
      `~${metersToFeet(nearestRoute.distMeters)} ft from "${routeLabel(nearestRoute)}" (open to ${vClass}) — within the typical motorized dispersed-camping corridor.`,
    );
    return {
      ...base,
      level: "green",
      title: "Likely legal — motorized corridor",
      subtitle: unit,
      reasons,
      rules: mr.rules,
      stayLimit: mr.stayLimit,
    };
  }

  // Inside the corridor but not open today. Unreadable dates mean "verify", never open.
  if (inCorridor && season) {
    const where = `~${metersToFeet(nearestRoute.distMeters)} ft from "${routeLabel(nearestRoute)}"`;
    const blmNote = nearestRoute.seasonNote ? ` The BLM's note on it reads "${nearestRoute.seasonNote}".` : "";
    reasons.push(
      season === "closed"
        ? `${where}, but today is outside its Motor Vehicle Use Map open season, so it cannot be driven to reach a campsite here right now.`
        : nearestRoute.isBlm
          ? `${where}, but the BLM marks it as seasonally restricted and publishes no dates the app can check, so it may be closed today.${blmNote} Check with the BLM field office before driving in.`
          : `${where}, but its Motor Vehicle Use Map season dates could not be read, so it may be closed today. Check the map's dates before driving in.`,
    );
    return {
      ...base,
      level: "yellow",
      title: season === "closed" ? "Route closed for the season" : "Route may be closed for the season",
      subtitle: unit,
      reasons,
      rules: mr.rules,
      stayLimit: mr.stayLimit,
    };
  }

  if (nearestRoute && nearestRoute.distMeters <= NEAR_M) {
    reasons.push(
      `Nearest designated route "${routeLabel(nearestRoute)}" is ~${metersToFeet(nearestRoute.distMeters)} ft away — likely beyond the ~300 ft motorized corridor, or it may be non-motorized.`,
    );
    return {
      ...base,
      level: "yellow",
      title: "Public land — verify the corridor",
      subtitle: unit,
      reasons,
      rules: mr.rules,
      stayLimit: mr.stayLimit,
    };
  }

  reasons.push(
    "No open MVUM route is loaded nearby (the data may be incomplete at this zoom). Cross-country motorized travel is usually prohibited — you typically must camp near a designated open route.",
  );
  return {
    ...base,
    level: "yellow",
    title: "Public land — no route nearby",
    subtitle: unit,
    reasons,
    rules: mr.rules,
    stayLimit: mr.stayLimit,
  };
}

function routeLabel(r: NearestRoute): string {
  if (r.name && r.routeId) return `${r.name} (${r.routeId})`;
  return r.name || r.routeId || (r.isTrail ? "trail" : "road");
}
