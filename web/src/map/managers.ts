// Single source of truth for land-manager classification, colors, and labels.
// Raw agency codes/names from many federal datasets (BLM SMA, PAD-US, USFS) are
// normalized to this small enum so styling, the legend, and the legality engine
// all agree.

export type Manager =
  | "BLM"
  | "USFS"
  | "NPS"
  | "USFWS"
  | "STATE"
  | "USBR"
  | "DOD"
  | "TRIBAL"
  | "PRIVATE"
  | "OTHER";

export interface ManagerInfo {
  /** Short label for the legend. */
  label: string;
  /** Fuller name for the verdict card. */
  fullName: string;
  /** Fill color (hex). */
  color: string;
  /** Is dispersed camping generally allowed on this manager's land? */
  dispersedFriendly: boolean;
}

export const MANAGERS: Record<Manager, ManagerInfo> = {
  BLM: { label: "BLM", fullName: "Bureau of Land Management", color: "#E0A93B", dispersedFriendly: true },
  USFS: { label: "Nat'l Forest", fullName: "US Forest Service", color: "#4C7A3F", dispersedFriendly: true },
  NPS: { label: "Nat'l Park", fullName: "National Park Service", color: "#2F7E78", dispersedFriendly: false },
  USFWS: { label: "Wildlife Refuge", fullName: "US Fish & Wildlife Service", color: "#C77B3B", dispersedFriendly: false },
  STATE: { label: "State Land", fullName: "State / State Trust Land", color: "#4A7CB5", dispersedFriendly: false },
  USBR: { label: "Reclamation", fullName: "Bureau of Reclamation", color: "#5AA0A0", dispersedFriendly: false },
  DOD: { label: "Military", fullName: "Dept. of Defense", color: "#8E6FB0", dispersedFriendly: false },
  TRIBAL: { label: "Tribal Land", fullName: "Tribal / BIA Land", color: "#9B6A4A", dispersedFriendly: false },
  PRIVATE: { label: "Private / Unmapped", fullName: "Private or Unmapped Land", color: "#C9C9C2", dispersedFriendly: false },
  OTHER: { label: "Other Public", fullName: "Other Public Land", color: "#9AA0A6", dispersedFriendly: false },
};

export const MANAGER_ORDER: Manager[] = [
  "BLM",
  "USFS",
  "NPS",
  "USFWS",
  "STATE",
  "USBR",
  "DOD",
  "TRIBAL",
  "PRIVATE",
  "OTHER",
];

/**
 * Normalize a raw agency code/name from any federal dataset to a Manager.
 * Handles SMA `ADMIN_AGENCY_CODE`, PAD-US `Mang_Name`/`Own_Name`, and free text.
 */
export function normalizeManager(raw: unknown): Manager {
  if (raw == null) return "OTHER";
  const s = String(raw).trim().toUpperCase();
  if (!s) return "OTHER";

  // Forest Service (SMA code is "USFS"; PAD-US uses "FS")
  if (s === "USFS" || s === "FS" || s.includes("FOREST")) return "USFS";
  // BLM
  if (s === "BLM" || s.includes("LAND MANAGEMENT")) return "BLM";
  // National Park Service
  if (s === "NPS" || s.includes("PARK SERVICE") || s.includes("NATIONAL PARK")) return "NPS";
  // Fish & Wildlife (SMA code is "USFW")
  if (s === "FWS" || s === "USFW" || s === "USFWS" || s.includes("FISH AND WILDLIFE") || s.includes("FISH & WILDLIFE") || s.includes("WILDLIFE REFUGE"))
    return "USFWS";
  // Reclamation
  if (s === "BOR" || s === "USBR" || s.includes("RECLAMATION")) return "USBR";
  // Defense
  if (s === "DOD" || s === "DOE" || s.includes("DEFENSE") || s.includes("ARMY") || s.includes("NAVY") || s.includes("AIR FORCE") || s.includes("MILITARY"))
    return "DOD";
  // Tribal / BIA
  if (s === "BIA" || s.includes("TRIB") || s.includes("INDIAN") || s.includes("RESERVATION")) return "TRIBAL";
  // State (SMA code is "ST"; also state trust / land board / parks / wildlife areas)
  if (s === "ST" || s === "STAT" || s === "STATE" || s === "SLB" || s.startsWith("STATE")) return "STATE";
  // Private
  if (s === "PVT" || s === "PRI" || s.includes("PRIVATE")) return "PRIVATE";

  return "OTHER";
}

/** A MapLibre `match` expression mapping a normalized `manager` property → color. */
export function managerColorExpression(property = "manager"): unknown[] {
  const expr: unknown[] = ["match", ["get", property]];
  for (const m of MANAGER_ORDER) {
    expr.push(m, MANAGERS[m].color);
  }
  expr.push(MANAGERS.OTHER.color); // fallback
  return expr;
}
