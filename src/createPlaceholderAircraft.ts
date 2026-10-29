import {
  Color3,
  CreateBox,
  Quaternion,
  Scene,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
} from "@babylonjs/core";
import { MOMENTUM_PITCH_LIMIT } from "./cameraFollow";
import { aircraftParameterDefaults, type AircraftParameters } from "./settings";

export type FlightViewMode = "first" | "third";

export interface AircraftEntity {
  root: TransformNode;
  cockpit: TransformNode;
  /** Parent for an external aircraft mesh; may include a cockpit interior. */
  modelRoot: TransformNode;
  /** Hide the block placeholder once a real mesh is in `modelRoot`. */
  setModelLoaded(loaded: boolean): void;
  getChaseDistanceMeters(): number;
  firstPersonCamera: UniversalCamera;
  thirdPersonCamera: UniversalCamera;
  orbitChaseCamera(yaw: number, pitch: number): void;
  zoomChaseCamera(factor: number): void;
  /**
   * What the chase camera orbits in. `null` rides on the aircraft and turns
   * with every rotation it makes (the original). A world rotation — say,
   * heading and travel pitch — follows that direction with a planet-level
   * horizon. Orbit pitch is combined before the ±85° limit, and orbit yaw
   * stays about planet up. Call it each frame after the aircraft moves.
   */
  setChaseFrame(rotation: Quaternion | null): void;
  /** Both flight cameras' vertical field of view, in degrees. */
  setFieldOfView(degrees: number): void;
  /**
   * Turns the cockpit camera about the pilot eye, as a 360 photograph's look:
   * heading clockwise from the nose, pitch above the aircraft's horizontal
   * plane, no roll of its own, and the vertical field of view.
   */
  lookFromCockpit(look: { headingDeg: number; pitchDeg: number; verticalFovDeg: number }): void;
  /** Both flight cameras' near clipping plane, in metres. */
  setNearClipMeters(meters: number): void;
  setViewMode(mode: FlightViewMode): void;
  toggleViewMode(): FlightViewMode;
  getViewMode(): FlightViewMode;
  dispose(): void;
}

const FIRST_PERSON_OFFSET = new Vector3(0, 0.2, 0.6);
const RADIANS_PER_DEGREE = Math.PI / 180;

function configureFlightCamera(camera: UniversalCamera, fieldOfViewDeg: number, nearClipMeters: number): void {
  camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
  camera.minZ = nearClipMeters;
  camera.maxZ = 250_000;
  camera.fov = fieldOfViewDeg * RADIANS_PER_DEGREE;
  camera.inertia = 0.92;
}

export interface AircraftPresentationOptions {
  /** Pilot eye in body axes, including the camera's own position offset. */
  cockpitOffset?: { x: number; y: number; z: number };
  /** Keep a supplied cockpit interior visible while looking from the pilot eye. */
  showModelInCockpit?: boolean;
  /** A declared engine assembly can be inspected with the same flight camera. */
  chaseTargetOffset?: { x: number; y: number; z: number };
  /** Initial only; subsequent zoom retains the normal physical camera controls. */
  chaseDistanceMeters?: number;
  chaseZoomLimits?: () => { min: number; max: number };
}

/**
 * The osfs.camera.* parameters. The chase offset is read once, when the
 * aircraft is created; the limits are read on every orbit and zoom.
 */
export function createPlaceholderAircraft(
  scene: Scene,
  parent: TransformNode,
  parameters: AircraftParameters = aircraftParameterDefaults(),
  options: AircraftPresentationOptions = {},
): AircraftEntity {
  const root = new TransformNode("aircraft-visual", scene);
  root.parent = parent;

  const fuselage = CreateBox("fuselage", { width: 1.2, height: 1.4, depth: 8 }, scene);
  fuselage.parent = root;
  fuselage.position = new Vector3(0, 0.7, 0);

  const wing = CreateBox("wing", { width: 11, height: 0.15, depth: 1.8 }, scene);
  wing.parent = root;
  wing.position = new Vector3(0, 0.8, 0.2);

  const tail = CreateBox("tail", { width: 0.15, height: 2.2, depth: 1.4 }, scene);
  tail.parent = root;
  tail.position = new Vector3(0, 1.8, -3.4);

  const material = new StandardMaterial("aircraft-mat", scene);
  material.diffuseColor = Color3.FromHexString("#d8dee9");
  material.specularColor = Color3.FromHexString("#4c566a");
  const meshes: AbstractMesh[] = [fuselage, wing, tail];
  for (const mesh of meshes) {
    mesh.material = material;
    mesh.isVisible = false;
  }

  const modelRoot = new TransformNode("aircraft-model-root", scene);
  modelRoot.parent = root;

  const cockpit = new TransformNode("cockpit", scene);
  cockpit.parent = root;
  cockpit.position = new Vector3(0, 1.1, 1.8);
  if (options.cockpitOffset) {
    const { x, y, z } = options.cockpitOffset;
    cockpit.position.set(x, y, z);
  }
  cockpit.rotationQuaternion = Quaternion.Identity();

  const firstPersonCamera = new UniversalCamera("cockpit-camera", Vector3.Zero(), scene);
  firstPersonCamera.parent = cockpit;
  firstPersonCamera.position = options.cockpitOffset ? Vector3.Zero() : FIRST_PERSON_OFFSET.clone();
  configureFlightCamera(firstPersonCamera, parameters.get("osfs.camera.fieldOfView"), parameters.get("osfs.camera.nearClipMeters"));

  const thirdPersonCamera = new UniversalCamera("chase-camera", Vector3.Zero(), scene);
  thirdPersonCamera.parent = root;
  // Only used when the chase camera should not turn with the whole aircraft.
  const chasePivot = new TransformNode("chase-pivot", scene);
  chasePivot.rotationQuaternion = Quaternion.Identity();
  const chaseOffset = new Vector3(0, parameters.get("osfs.camera.chaseHeight"), -parameters.get("osfs.camera.chaseDistance"));
  thirdPersonCamera.position = chaseOffset.clone();
  configureFlightCamera(thirdPersonCamera, parameters.get("osfs.camera.fieldOfView"), parameters.get("osfs.camera.nearClipMeters"));

  let viewMode: FlightViewMode = "third";
  let chaseYaw = 0;
  let chasePitch = Math.atan2(chaseOffset.y, -chaseOffset.z);
  const chaseTarget = options.chaseTargetOffset ? new Vector3(options.chaseTargetOffset.x, options.chaseTargetOffset.y, options.chaseTargetOffset.z) : Vector3.Zero();
  const zoomLimits = (): { min: number; max: number } => options.chaseZoomLimits?.() ?? parameters.get("osfs.camera.chaseZoomLimits");
  const initialLimits = zoomLimits();
  let chaseDistance = Math.max(initialLimits.min, Math.min(initialLimits.max, options.chaseDistanceMeters ?? chaseOffset.length()));
  let followPitch = 0;
  let followsWorldFrame = false;
  const followForward = new Vector3();
  const updateChaseCamera = (): void => {
    // Orbit in a level heading frame. Tilting the parent would bank the view
    // when orbiting sideways, and pitch + orbit could carry it past a pole.
    const pitch = followsWorldFrame
      ? Math.max(-MOMENTUM_PITCH_LIMIT, Math.min(MOMENTUM_PITCH_LIMIT, chasePitch - followPitch))
      : chasePitch;
    const horizontal = chaseDistance * Math.cos(pitch);
    thirdPersonCamera.position.set(Math.sin(chaseYaw) * horizontal, Math.sin(pitch) * chaseDistance, -Math.cos(chaseYaw) * horizontal);
    thirdPersonCamera.position.addInPlace(chaseTarget);
    thirdPersonCamera.setTarget(chaseTarget);
  };
  updateChaseCamera();

  let modelLoaded = false;
  const setViewMode = (mode: FlightViewMode): void => {
    viewMode = mode;
    scene.activeCamera = mode === "first" ? firstPersonCamera : thirdPersonCamera;
    const exterior = mode === "third";
    // The placeholder blocks stand in only while no real mesh is loaded.
    for (const mesh of meshes) {
      mesh.isVisible = exterior && !modelLoaded;
    }
    modelRoot.setEnabled(exterior || options.showModelInCockpit === true);
  };

  setViewMode("third");

  return {
    root,
    cockpit,
    modelRoot,
    setModelLoaded(loaded: boolean): void {
      modelLoaded = loaded;
      setViewMode(viewMode);
    },
    getChaseDistanceMeters(): number {
      return chaseDistance;
    },
    firstPersonCamera,
    thirdPersonCamera,
    orbitChaseCamera(yaw, pitch): void {
      if (viewMode !== "third" || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
      const limits = parameters.get("osfs.camera.orbitPitchLimits");
      chaseYaw = (chaseYaw + yaw) % (2 * Math.PI);
      chasePitch = Math.max(limits.min * RADIANS_PER_DEGREE, Math.min(limits.max * RADIANS_PER_DEGREE, chasePitch + pitch));
      updateChaseCamera();
    },
    setChaseFrame(rotation): void {
      followsWorldFrame = rotation !== null;
      if (rotation === null) {
        if (thirdPersonCamera.parent !== root) thirdPersonCamera.parent = root;
        followPitch = 0;
      } else {
        followForward.set(0, 0, 1).applyRotationQuaternionInPlace(rotation);
        followPitch = Math.atan2(followForward.y, Math.hypot(followForward.x, followForward.z));
        chasePivot.position.copyFrom(root.getAbsolutePosition());
        Quaternion.RotationYawPitchRollToRef(Math.atan2(followForward.x, followForward.z), 0, 0, chasePivot.rotationQuaternion!);
        if (thirdPersonCamera.parent !== chasePivot) thirdPersonCamera.parent = chasePivot;
      }
      updateChaseCamera();
    },
    setFieldOfView(degrees): void {
      firstPersonCamera.fov = degrees * RADIANS_PER_DEGREE;
      thirdPersonCamera.fov = degrees * RADIANS_PER_DEGREE;
    },
    lookFromCockpit({ headingDeg, pitchDeg, verticalFovDeg }): void {
      if (![headingDeg, pitchDeg, verticalFovDeg].every(Number.isFinite)) return;
      // The camera starts turned half a turn to face the nose; a right-handed scene mirrors both turns.
      const turn = scene.useRightHandedSystem ? -1 : 1;
      Quaternion.RotationYawPitchRollToRef(Math.PI + turn * headingDeg * RADIANS_PER_DEGREE, -turn * pitchDeg * RADIANS_PER_DEGREE, 0,
        firstPersonCamera.rotationQuaternion!);
      firstPersonCamera.fov = verticalFovDeg * RADIANS_PER_DEGREE;
    },
    setNearClipMeters(meters): void {
      firstPersonCamera.minZ = meters;
      thirdPersonCamera.minZ = meters;
    },
    zoomChaseCamera(factor): void {
      if (viewMode !== "third" || !Number.isFinite(factor) || factor <= 0) return;
      const limits = zoomLimits();
      chaseDistance = Math.max(limits.min, Math.min(limits.max, chaseDistance * factor));
      updateChaseCamera();
    },
    setViewMode,
    toggleViewMode(): FlightViewMode {
      setViewMode(viewMode === "first" ? "third" : "first");
      return viewMode;
    },
    getViewMode(): FlightViewMode {
      return viewMode;
    },
    dispose(): void {
      firstPersonCamera.dispose();
      thirdPersonCamera.dispose();
      chasePivot.dispose();
      cockpit.dispose();
      modelRoot.dispose();
      material.dispose();
      for (const mesh of meshes) mesh.dispose();
      root.dispose();
    },
  };
}
