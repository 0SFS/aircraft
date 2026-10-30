import type { ParameterSpec } from "foss-earth/settings";
import {
  catalogueDefaults,
  catalogueSpec,
  catalogueStore,
  type CatalogueParameters,
  type CatalogueRegistry,
  type CatalogueStore,
  type CatalogueValues,
} from "@0sfs/engines/parameterCatalogue";
import { AIRCRAFT_LOD_IDS, type AircraftId } from "./aircraftCatalog";

/**
 * The aircraft's flight parameters: its part of the flight's settings, with
 * their homes, section titles and defaults. The host composes the parts into
 * its catalogue in this order and registers them. Spec:
 * docs/proposals/flight-settings.md.
 */

const MODEL = { tab: "aircraft", section: "model" } as const;
const AIRCRAFT_VISUALS = { tab: "debug", section: "aircraft-visuals" } as const;
const CAMERA = { tab: "aircraft", section: "camera" } as const;
const ENGINE_TEST = { tab: "engine", section: "test" } as const;
const LIGHTS = { tab: "aircraft", section: "lights" } as const;
const LOD_LABELS: Record<(typeof AIRCRAFT_LOD_IDS)[number], string> = {
  auto: "Auto, by chase distance", hd: "HD, highest detail", lod3: "LOD3, near", lod2: "LOD2, medium", lod1: "LOD1, far", lod0: "LOD0, silhouette",
};

/** Section titles for the sections only the aircraft's parameters are in, by tab and section id. */
export const AIRCRAFT_SECTION_TITLES_1: readonly (readonly [tab: string, section: string, title: string])[] = [
  ["aircraft", "lights", "Lights"],
];

/** Section titles for the sections only the aircraft's parameters are in, by tab and section id. */
export const AIRCRAFT_SECTION_TITLES_2: readonly (readonly [tab: string, section: string, title: string])[] = [
  ["debug", "aircraft-visuals", "Aircraft visuals"],
];

const main = <T extends { tab: string; section: string }>(home: T) => ({ ...home, level: "main" as const });
const all = <T extends { tab: string; section: string }>(home: T) => ({ ...home, level: "all" as const });
const within = (min: number, max: number) => () => ({ min, max });

export const AIRCRAFT_PARAMETERS_1 = [
  {
    id: "osfs.debug.renderStowedGear", label: "Render stowed landing gear",
    description: "Keep enclosed wheels and struts drawable at full retraction to inspect their stowed pose. Bay doors remain visible in either mode.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Fully enclosed landing gear needs no draw calls during normal flight.",
    home: main(AIRCRAFT_VISUALS), appliesLive: true, source: "aircraft/src/createAircraftModel.ts",
  },
] as const satisfies readonly ParameterSpec[];

export const AIRCRAFT_PARAMETERS_2 = [
  {
    id: "osfs.aircraft.propellerDiscs",
    label: "Flat propeller discs",
    description: "Use lower-cost flat discs at high RPM instead of the default semitransparent 3D swept propeller volumes. Slow propellers retain their individual 3D blades in either mode. This changes presentation only, never motor RPM or thrust.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Preserve the three-dimensional swept blade shape at high RPM unless the pilot opts into flat discs.",
    home: main(MODEL), appliesLive: true, source: "aircraft/src/aircraftAnimation.ts",
  },
  {
    id: "osfs.aircraft.lod",
    label: "Model detail",
    description: "Which of the aircraft's models is drawn; Auto picks one by the chase camera's distance.",
    unit: "none",
    kind: "choice",
    choices: AIRCRAFT_LOD_IDS.map(id => ({ id, label: LOD_LABELS[id] })),
    default: "auto",
    defaultReason: "The original default: a distant aircraft draws a coarser model.",
    home: all(MODEL),
    appliesLive: true,
    source: "aircraft/src/aircraftCatalog.ts",
  },
] as const satisfies readonly ParameterSpec[];

export const AIRCRAFT_PARAMETERS_3 = [
  // Aircraft → Lights: navigation, anti-collision, landing and taxi lights.
  {
    id: "osfs.lights.navigation",
    label: "Navigation lights",
    description: "Red on the left wingtip, green on the right and white at the tail, each in its own sector at the intensities 14 CFR 25.1389 to 25.1395 require: a glare at night, a faint dot by day, as they are.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "An aircraft shows its position lights from sunset to sunrise, and many keep them on by day.",
    home: main(LIGHTS), appliesLive: true, source: "aircraft/src/aircraftLights.ts",
  },
  {
    id: "osfs.lights.antiCollision",
    label: "Anti-collision lights",
    description: "White wingtip strobes and red beacons, flashing at 50 and 45 a minute with the 400 cd effective intensity 14 CFR 25.1401 requires. While they are on, each flash asks for a frame at its start and end.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "On whenever an engine runs.",
    home: main(LIGHTS), appliesLive: true, source: "aircraft/src/aircraftLights.ts",
  },
  {
    id: "osfs.lights.landing",
    label: "Landing and taxi lights",
    description: "The landing lamp's narrow 100,000 cd beam and the taxi lamp's wide 30,000 cd one, pointed a few degrees below the nose; on a gear leg, lit only with the gear down.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "On for take-off and landing, which is where a flight begins.",
    home: main(LIGHTS), appliesLive: true, source: "aircraft/src/aircraftLights.ts",
  },
  {
    id: "osfs.lights.groundLight",
    label: "Beams on the ground",
    description: "Whether the landing and taxi beams light the map's ground, by the inverse square of the distance and the beam's edge. Each lit beam costs every pixel of ground a few operations; off, the lamps still glare.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "A runway at night is seen by the aircraft's own beams.",
    home: main(LIGHTS), appliesLive: true, source: "aircraft/src/createAircraftLights.ts",
  },
  {
    id: "osfs.lights.sizePx",
    label: "Light glare size",
    description: "The square each light's light is spread over, px across: a sharp core and a faint glare around it. A light's brightness is the same at any size; a larger square leaves room for a bright light's glare.",
    unit: "px", kind: "number", step: 1, bounds: within(4, 96), default: 32,
    defaultReason: "Room for the glare of a navigation light a few metres away at night, at a pixel's cost a frame for each light.",
    home: all(LIGHTS), appliesLive: true, source: "aircraft/src/createAircraftLights.ts",
  },
  {
    id: "osfs.lights.liftMeters",
    label: "Light lift",
    description: "How far each light is drawn towards the camera, so the surface it is mounted on does not cut its glare in half. The airframe still hides a light behind it.",
    unit: "m", kind: "number", step: 0.05, bounds: within(0, 2), default: 0.3,
    defaultReason: "Clear of a wingtip's fairing, and less than any part of an airframe that should hide a light.",
    home: all(LIGHTS), appliesLive: true, source: "aircraft/src/createAircraftLights.ts",
  },
  {
    id: "osfs.lights.referenceNits",
    label: "Light reference without a sky",
    description: "With the sky model off there is no exposure: the luminance a light's glare is shown against as white.",
    unit: { id: "cd/m2", text: "cd/m²" }, kind: "number", step: 0.25, scale: "log2", bounds: within(1, 100_000), default: 1000,
    defaultReason: "The exhaust's own reference, so the two agree with the sky off.",
    home: all(LIGHTS), appliesLive: true, source: "aircraft/src/createAircraftLights.ts",
  },
] as const satisfies readonly ParameterSpec[];

export const AIRCRAFT_PARAMETERS_4 = [
  // Aircraft → Camera.
  {
    id: "osfs.camera.yawSpringTime",
    label: "Yaw spring time",
    description: "In Yaw mode, the spring's time constant for following aircraft heading without bounce. The default settles a stationary heading change by about 95% in 0.57 s. Zero follows heading immediately.",
    unit: "s",
    kind: "number",
    step: 0.01,
    bounds: within(0, 1),
    default: 0.12,
    defaultReason: "A short lag softens heading changes while keeping the camera close behind a turning aircraft.",
    home: all(CAMERA),
    appliesLive: true,
    source: "aircraft/src/cameraFollow.ts",
  },
  {
    id: "osfs.camera.orbitPitchLimits",
    label: "Orbit pitch limits",
    description: "How far below and above the aircraft the chase camera may orbit.",
    unit: "deg",
    kind: "range",
    step: 1,
    bounds: within(-89, 89),
    default: { min: -60, max: 81 },
    defaultReason: "The original limits, π/3 below and 0.45π above the aircraft's horizontal.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },
] as const satisfies readonly ParameterSpec[];

export const AIRCRAFT_PARAMETERS_5 = [
  {
    id: "osfs.camera.chaseDistance",
    label: "Chase distance",
    description: "How far behind the aircraft the chase camera starts.",
    unit: "m",
    kind: "number",
    step: 0.5,
    bounds: within(0.1, 200),
    default: 14,
    defaultReason: "The original chase offset.",
    home: all(CAMERA),
    appliesLive: false,
    source: "aircraft/src/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.chaseHeight",
    label: "Chase height",
    description: "How far above the aircraft the chase camera starts; with the distance it sets the resting orbit pitch.",
    unit: "m",
    kind: "number",
    step: 0.1,
    bounds: within(-20, 50),
    default: 2.2,
    defaultReason: "The original chase offset.",
    home: all(CAMERA),
    appliesLive: false,
    source: "aircraft/src/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.chaseZoomLimits",
    label: "Chase zoom limits",
    description: "How close and how far the chase camera may zoom.",
    unit: "m",
    kind: "range",
    scale: "log2",
    step: 0.1,
    bounds: within(0.05, 5_000),
    default: { min: 8, max: 500 },
    defaultReason: "The original limits.",
    home: all(CAMERA),
    appliesLive: true,
    source: "aircraft/src/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.nearClipMeters",
    label: "Camera near clip",
    description: "The closest distance either flight camera draws. A small distance keeps the F-35B cockpit panel visible; larger distances reduce depth precision artifacts in distant scenery.",
    unit: "m",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 2),
    default: 0.05,
    defaultReason: "Five centimetres keeps nearby cockpit geometry visible.",
    home: all(CAMERA),
    appliesLive: true,
    source: "aircraft/src/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.fieldOfView",
    label: "Field of view",
    description: "The vertical field of view of the cockpit and chase cameras; wider shows and loads more.",
    unit: "deg",
    kind: "number",
    step: 1,
    bounds: within(20, 120),
    alwaysShowTrack: true,
    default: 1.05 * 180 / Math.PI,
    defaultReason: "1.05 rad, the original field of view of both flight cameras.",
    home: all(CAMERA),
    appliesLive: true,
    source: "aircraft/src/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.aircraft.windowTint",
    label: "Window tint",
    description: "How much of the model's own tint its see-through canopy and windows draw: at 100% they darken the view through them as the model was made, at 0% they are clear. Their reflections stay either way, and aircraft with opaque windows are unchanged.",
    unit: "fraction", kind: "number", step: 0.05, bounds: within(0, 1), alwaysShowTrack: true, default: 0.25,
    defaultReason: "A quarter of AF267's F-35B canopy tint: the full tint hid too much of the outside from the cockpit.",
    home: main(CAMERA), appliesLive: true, source: "aircraft/src/createAircraftModel.ts",
  },
] as const satisfies readonly ParameterSpec[];

export const AIRCRAFT_PARAMETERS_6 = [
  // Engine.
  {
    id: "osfs.engineTest.zoomLimits", label: "Test stand zoom limits",
    description: "The nearest and farthest inspection camera distances from the isolated engine assembly.",
    unit: "m", kind: "range", scale: "log2", step: 0.1, bounds: within(0.2, 1000), default: { min: 1, max: 100 },
    defaultReason: "The isolated nozzle can be inspected much closer than the full aircraft.",
    home: main(ENGINE_TEST), appliesLive: true, source: "aircraft/src/createPlaceholderAircraft.ts",
  },
] as const satisfies readonly ParameterSpec[];

/** Every one of the aircraft's parameters. */
export const AIRCRAFT_PARAMETERS = [
  ...AIRCRAFT_PARAMETERS_1,
  ...AIRCRAFT_PARAMETERS_2,
  ...AIRCRAFT_PARAMETERS_3,
  ...AIRCRAFT_PARAMETERS_4,
  ...AIRCRAFT_PARAMETERS_5,
  ...AIRCRAFT_PARAMETERS_6,
] as const;

/** The effective value of each of the aircraft's parameters, by id. */
export type AircraftParameterValues = CatalogueValues<typeof AIRCRAFT_PARAMETERS> & {
  /** Registered by the host, whose fleet supplies its choices. */
  "osfs.aircraft.id": AircraftId;
  /** Registered by the host, whose fleet supplies its choices. */
  "osfs.aircraft.generation": string;
};

export type AircraftParameterId = keyof AircraftParameterValues & string;

/** What the aircraft code reads its parameters through: the registry, or its defaults in a test. */
export type AircraftParameters = CatalogueParameters<AircraftParameterValues>;

/** Reads, writes and watches the aircraft's parameters, typed by id. */
export type AircraftParameterStore = CatalogueStore<AircraftParameterValues>;

/** The registry, typed for the aircraft's parameters. */
export function aircraftParameterStore(registry: CatalogueRegistry): AircraftParameterStore {
  return catalogueStore(registry);
}

/** The spec of one of the aircraft's parameters. */
export const aircraftParameterSpec = catalogueSpec(AIRCRAFT_PARAMETERS);

/**
 * The aircraft's parameter defaults in memory, for code that runs without a
 * registry, such as a unit test. Overrides stand in for values the test sets.
 */
export function aircraftParameterDefaults(overrides: Partial<AircraftParameterValues> = {}): AircraftParameterStore {
  return catalogueDefaults(aircraftParameterSpec, overrides);
}
