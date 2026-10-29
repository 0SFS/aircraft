export const AIRCRAFT_IDS = ["cessna-172", "cirrus-vision-jet", "cirrus-vision-jet-g2", "cirrus-vision-jet-g3", "f-35b"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

/** Gallery choices group runtime variants without changing their saved IDs. */
export const AIRCRAFT_FAMILY_IDS = ["cessna-172", "cirrus-vision-jet", "f-35b"] as const;
export type AircraftFamilyId = (typeof AIRCRAFT_FAMILY_IDS)[number];

const extraAircraftIds = new Set<string>();
const extraFamilyIds = new Set<string>();

/** A mod may add an aircraft id that is not in the built-in tuple. */
export function registerAircraftId(id: string): void {
  extraAircraftIds.add(id);
}

/** Built-in ids stay. A mod id added with `registerAircraftId` can leave. */
export function unregisterAircraftId(id: string): void {
  if ((AIRCRAFT_IDS as readonly string[]).includes(id)) return;
  extraAircraftIds.delete(id);
}

export function registerAircraftFamilyId(id: string): void {
  if (!(AIRCRAFT_FAMILY_IDS as readonly string[]).includes(id)) extraFamilyIds.add(id);
}

export function unregisterAircraftFamilyId(id: string): void {
  if ((AIRCRAFT_FAMILY_IDS as readonly string[]).includes(id)) return;
  extraFamilyIds.delete(id);
}

export function isAircraftId(value: unknown): value is AircraftId {
  return typeof value === "string" && ((AIRCRAFT_IDS as readonly string[]).includes(value) || extraAircraftIds.has(value));
}

export function isAircraftFamilyId(value: unknown): value is AircraftFamilyId {
  return typeof value === "string" && ((AIRCRAFT_FAMILY_IDS as readonly string[]).includes(value) || extraFamilyIds.has(value));
}
