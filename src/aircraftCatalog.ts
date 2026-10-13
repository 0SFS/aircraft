import type { EngineGasSupportDefinition } from "@0sfs/exhaust/engineGasSupport";
import {
  AIRCRAFT_FAMILY_IDS,
  AIRCRAFT_IDS,
  type AircraftFamilyId,
  type AircraftId,
  isAircraftFamilyId,
  isAircraftId,
} from "./aircraftIds";

export { AIRCRAFT_FAMILY_IDS, AIRCRAFT_IDS, isAircraftFamilyId, isAircraftId };
export type { AircraftFamilyId, AircraftId };

/**
 * Selectable aircraft and their level-of-detail meshes.
 *
 * Model axis convention: the sim's body frame is +X left, +Y up, +Z nose
 * (see `flightAttitudeToQuaternion`). glTF's own convention is -Z forward, so
 * an asset authored the standard way needs a 180 deg yaw to line up. That is
 * a pure rotation, not a mirror, so chirality (propeller twist) is preserved.
 */

// Level NUMBERS run coarsest-first: lod0 is the silhouette and each step up
// adds detail, so a bigger number is always a better mesh. That is the
// direction the generators number their `--lod` argument in, and it is chosen
// so that adding or removing a level at the bottom of a ladder does not
// renumber the ones above it - a renumbering is a silent change to every asset
// path and to every stored preference. It also means the two airframes agree
// on what "lod3" means - their best procedural mesh - even though the C172
// carries one level below the Vision Jet's coarsest.
//
// The ARRAYS below still run FINEST first, because that is the order
// `selectAutoLod` walks and the order the panel offers. "hd" sits above lod3
// and is not always ours: an airframe can carry a level by another artist,
// which is why the credit belongs to the LEVEL rather than to the airframe.
export const AIRCRAFT_LOD_IDS = ["auto", "hd", "lod3", "lod2", "lod1", "lod0"] as const;
export type AircraftLodId = (typeof AIRCRAFT_LOD_IDS)[number];
export type AircraftLodMeshId = Exclude<AircraftLodId, "auto">;

/** Who made a mesh, and whatever its licence requires be shown with it. */
export interface AircraftModelCredit {
  artist: string;
  /** One line on what this mesh is for. Shown next to it in the panel. */
  note: string;
  licence?: string;
  sourceUrl?: string;
}

export interface AircraftFamilyDefinition {
  id: AircraftFamilyId;
  label: string;
  summary: string;
  thumbnail: {
    /** Static image path relative to the Vite base URL. */
    path: string;
    credit: AircraftModelCredit;
  };
  defaultAircraftId: AircraftId;
  variants: readonly AircraftFamilyVariantDefinition[];
  /** Present only when this family offers a variant selector. */
  variantLabel?: string;
  developmentNote?: string;
}

export interface AircraftFamilyVariantDefinition {
  id: string;
  aircraftId: AircraftId;
  label: string;
}

/** One complete choice, applied atomically when the runtime aircraft changes. */
export interface AircraftSelection {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  generationId?: string;
}

export interface AircraftLodDefinition {
  id: AircraftLodMeshId;
  label: string;
  /** Total displayed triangles, including the selected installed engine export. */
  triangles: number;
  /** Path relative to the Vite base URL. */
  path: string;
  /** Chase-camera distance (m) at or beyond which "Auto" picks this level. */
  autoFromMeters: number;
  credit: AircraftModelCredit;
  /**
   * A level "Auto" never picks. A level is opt-in when loading it is a
   * decision rather than a default - a third-party mesh whose licence has to be
   * honoured, or one heavy enough that nobody should pay for it without
   * choosing to. Choosing it in the level list is that decision: it is offered
   * there like any other level, and loads only when chosen.
   */
  optIn?: boolean;
}

export interface AircraftTemperatureObservation {
  readonly property: string;
  readonly unit: "K" | "degC" | "degF";
  /** Native validity/initialization flags which must all be present and true. */
  readonly availableWhen?: readonly string[];
}

export interface AircraftExhaustInstallation {
  id: string;
  engineIndex: number;
  opticalProfileId: string;
  attachmentNode: string;
  /** One connected interior/exterior gas domain, following the actual rigid duct. */
  gasSupport?: EngineGasSupportDefinition;
  /** Scope thermal glow to matching materials under this nozzle only. */
  hotSurfaceMaterialNames?: readonly string[];
  /** Optional common hardware root when hot solids sit upstream of the exhaust attachment. */
  hotSurfaceAttachmentNode?: string;
  /** Native temperature observation used by the declared hardware's optical profile. */
  hotSurfaceTemperature?: AircraftTemperatureObservation;
  /** Independent native solid regions; array order is shared with the optical consumer. */
  hotSurfaceRegions?: readonly {
    materialNames: readonly string[];
    temperature: AircraftTemperatureObservation;
  }[];
  /** Separate gas observation for the flame's temperature-indexed optical table. */
  gasTemperature?: AircraftTemperatureObservation;
  /** Upstream of augmentation; distinct from the mixed downstream gas bath. */
  upstreamGasTemperature?: AircraftTemperatureObservation;
  /** Optional artistic aerosol appearance; independent of the optical plume. */
  smokeProfileId?: string;
  /** Position/direction in the authored attachment's local coordinates. */
  exitPosition: readonly [number, number, number];
  direction: readonly [number, number, number];
  /** Display geometry in metres; not a performance model of the plume. */
  closedRadiusMeters: number;
  openRadiusMeters: number;
  lengthMeters: number;
  /** Native operating observation used for plume extent and smoke emission. */
  powerProperty: string;
  powerFullScale: number;
  fuelFlowProperty: string;
  /** Native burned augmentation fuel, kg/s; distinct from total supplied fuel. */
  afterburnerBurnedFuelFlowProperty?: string;
}

export interface AircraftDefinition {
  id: AircraftId;
  familyId: AircraftFamilyId;
  label: string;
  summary: string;
  /** Yaw applied to the imported glTF so its -Z nose faces the sim's +Z nose. */
  modelYawRad: number;
  /**
   * Model offset in body axes. The sim keeps the aircraft reference point
   * above the terrain by the profile-dependent stance, while exported meshes
   * sit near the ground plane.
   */
  modelOffset: { x: number; y: number; z: number };
  /** Pilot eye in the sim's body axes, relative to the aircraft reference point. */
  cockpitOffset?: { x: number; y: number; z: number };
  /** The exterior asset includes an interior that can be drawn in cockpit view. */
  cockpitMesh?: boolean;
  /** Native nozzle-position observer driving the model's optional petal rig. */
  nozzlePositionEngineIndex?: number;
  /** Authored wheel/arm geometry hidden at native gear position zero; doors stay visible. */
  stowedGearNodeNames?: readonly string[];
  /** Authored assembly roots retained in an isolated engine-test view; this may be only a nozzle. */
  engineTestNodeNames?: readonly string[];
  /** Generated from one source; full engine bytes are requested only by the stand. */
  engineAssets?: {
    full: { path: string; triangles: number };
    installed: { path: string; triangles: number };
    rig?: import("@0sfs/engines/engineNozzleRig").EngineNozzleRigDefinition;
  };
  /** Camera focus in aircraft body axes, measured in the authored rest pose including model offset. */
  engineTestFocusOffset?: { x: number; y: number; z: number };
  exhaustSources?: readonly AircraftExhaustInstallation[];
  /** Engines whose native augmentation state lights the throttle indicator. */
  afterburner?: {
    engineIndices: readonly number[];
    /** Representative plume hue for the HUD, not a fixed physical flame color. */
    accentColor: string;
  };
  /**
   * Blades on the propeller, or 0 for a jet. Sets how fast the blades can turn
   * before they alias and have to be swapped for a blurred disc: the image
   * repeats every `2*PI / blades`, so two samples per repeat is the limit.
   */
  propellerBlades: number;
  lods: readonly AircraftLodDefinition[];
}

/** Family cards choose an airframe; variants below the gallery choose its package. Filled by `registerAircraftFleet`. */
export const AIRCRAFT_FAMILIES: readonly AircraftFamilyDefinition[] = [];

/** Every selectable aircraft. Filled by `registerAircraftFleet`. */
export const AIRCRAFT_CATALOG: readonly AircraftDefinition[] = [];

/**
 * Supplies the fleet: the families and aircraft the host assembles from its
 * aircraft packages, in the order the gallery offers them. Called once, before
 * anything looks an aircraft up.
 */
export function registerAircraftFleet(
  families: readonly AircraftFamilyDefinition[],
  catalog: readonly AircraftDefinition[],
): void {
  if (AIRCRAFT_FAMILIES.length || AIRCRAFT_CATALOG.length) throw new Error("The aircraft fleet is already registered");
  (AIRCRAFT_FAMILIES as AircraftFamilyDefinition[]).push(...families);
  (AIRCRAFT_CATALOG as AircraftDefinition[]).push(...catalog);
}

export function getAircraftDefinition(id: AircraftId): AircraftDefinition {
  return AIRCRAFT_CATALOG.find((entry) => entry.id === id) ?? AIRCRAFT_CATALOG[0];
}

export function getAircraftFamily(id: AircraftFamilyId): AircraftFamilyDefinition {
  return AIRCRAFT_FAMILIES.find((family) => family.id === id) ?? AIRCRAFT_FAMILIES[0];
}

/** Includes the legacy Vision Jet runtime ID, which continues to select G1. */
export function getAircraftFamilyForAircraft(id: AircraftId): AircraftFamilyDefinition {
  return getAircraftFamily(getAircraftDefinition(id).familyId);
}

export function isAircraftLodId(value: unknown): value is AircraftLodId {
  return typeof value === "string" && (AIRCRAFT_LOD_IDS as readonly string[]).includes(value);
}

/** The levels "Auto" chooses between, finest first: every level but the opt-in ones. */
export function autoLods(definition: AircraftDefinition): readonly AircraftLodDefinition[] {
  return definition.lods.filter((lod) => !lod.optIn);
}

/** Keep staged and restored presentation choices valid for the selected package. */
export function normalizeAircraftSelection(selection: AircraftSelection): AircraftSelection {
  const definition = getAircraftDefinition(selection.aircraftId);
  const family = getAircraftFamily(definition.familyId);
  const familyVariant = family.variants.find((entry) => entry.id === selection.generationId)
    ?? family.variants.find((entry) => entry.aircraftId === selection.aircraftId)
    ?? family.variants[0];
  const normalizedDefinition = getAircraftDefinition(familyVariant.aircraftId);
  const lodId = selection.lodId === "auto"
    || normalizedDefinition.lods.some((lod) => lod.id === selection.lodId)
    ? selection.lodId
    : "auto";
  return {
    aircraftId: normalizedDefinition.id,
    lodId,
    generationId: familyVariant.id,
  };
}

/**
 * Coarsest level "Auto" uses whose `autoFromMeters` threshold the distance has
 * reached, and the finest one inside that. The finest always covers the close
 * range, whatever its own threshold says.
 */
export function selectAutoLod(
  definition: AircraftDefinition,
  chaseDistanceMeters: number,
): AircraftLodDefinition | null {
  const lods = autoLods(definition);
  let selected: AircraftLodDefinition | null = lods[0] ?? null;
  for (const lod of lods) {
    if (chaseDistanceMeters >= lod.autoFromMeters) selected = lod;
  }
  return selected;
}

/** Resolve a UI selection to a concrete mesh, or null when none is available. */
export function resolveLod(
  definition: AircraftDefinition,
  lodId: AircraftLodId,
  chaseDistanceMeters: number,
): AircraftLodDefinition | null {
  if (lodId === "auto") return selectAutoLod(definition, chaseDistanceMeters);
  // A level this airframe does not have, such as the Cessna asked for "hd",
  // falls back to the finest one it has rather than leaving it invisible.
  return definition.lods.find((lod) => lod.id === lodId) ?? autoLods(definition)[0] ?? definition.lods[0] ?? null;
}
