import { Quaternion } from '@babylonjs/core';
export type CameraFollowMode = 'aircraft' | 'yaw' | 'momentum' | 'planet';
export interface FollowState {
    headingRad: number;
    northVelocityFps: number;
    eastVelocityFps: number;
    verticalSpeedFps: number;
}
export const MOMENTUM_PITCH_LIMIT = 85 * Math.PI / 180;
export const DEFAULT_YAW_SPRING_TIME = .12;
/** Below a thousandth of a degree, finish exactly and let a paused view sleep. */
const YAW_REST = .00001;
/** Flight's east/up/south world: roll-free frame with the nose at the requested heading/pitch. */
function frame(heading: number, pitch: number): Quaternion {
    return Quaternion.RotationYawPitchRoll(Math.PI - heading, -pitch, 0);
}
const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
/** Fade unreliable directions out before hover noise can turn the view around. Speeds are m/s. */
function confidence(speed: number, low: number, high: number): number {
    const t = Math.max(0, Math.min(1, (speed - low) / (high - low)));
    return t * t * (3 - 2 * t);
}
/**
 * Yaw follows aircraft heading with a level, critically damped spring.
 * Momentum follows the direction of travel. With too little horizontal speed
 * for a reliable direction, at hover or in vertical flight, it keeps its view
 * and turns it as the aircraft turns, so moving off along the new heading
 * does not swing it.
 */
export function createCameraFollow() {
    let heading = 0, pitch = 0, targetHeading = 0, targetPitch = 0, aircraftHeading = 0;
    let momentumVelocity = 0;
    let yawHeading = 0, yawVelocity = 0, yawTarget = 0, yawActive = false;
    const yawFrame = frame(0, 0);
    let current = frame(0, 0);
    let mode: CameraFollowMode | null = null;
    return {
        /** True only while the Yaw spring needs another rendered frame. */
        isActive(): boolean { return mode === 'yaw' && yawActive; },
        /** `yawSpringSeconds` is the spring time constant; zero follows immediately. */
        update(nextMode: CameraFollowMode, state: FollowState, dt: number, yawSpringSeconds = DEFAULT_YAW_SPRING_TIME): Quaternion | null {
            if (nextMode === 'yaw') {
                if (mode !== nextMode) {
                    // Enter from the displayed follow heading, retaining its turn rate.
                    // Aircraft's frame is supplied by its body, Planet's is north.
                    yawHeading = mode === 'momentum' ? heading : mode === 'planet' ? 0
                        : Number.isFinite(state.headingRad) ? state.headingRad : 0;
                    yawVelocity = mode === 'momentum' ? momentumVelocity : 0;
                    yawTarget = yawHeading;
                }
                mode = nextMode;
                if (Number.isFinite(state.headingRad)) yawTarget = yawHeading + wrap(state.headingRad - yawHeading);
                const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
                const spring = Number.isFinite(yawSpringSeconds) && yawSpringSeconds >= 0 ? yawSpringSeconds : DEFAULT_YAW_SPRING_TIME;
                if (spring === 0) {
                    yawHeading = yawTarget;
                    yawVelocity = 0;
                } else if (seconds > 0) {
                    // Exact critically damped spring step, holding the target for this frame.
                    // Keep angular velocity so a changing target never restarts the easing.
                    const omega = 1 / spring;
                    const offset = wrap(yawHeading - yawTarget);
                    const k = yawVelocity + omega * offset;
                    const decay = Math.exp(-omega * seconds);
                    yawHeading = wrap(yawTarget + (offset + k * seconds) * decay);
                    yawVelocity = (yawVelocity - omega * k * seconds) * decay;
                }
                yawActive = Math.abs(wrap(yawTarget - yawHeading)) > YAW_REST || Math.abs(yawVelocity) > YAW_REST;
                if (!yawActive && seconds > 0) { yawHeading = wrap(yawTarget); yawVelocity = 0; }
                Quaternion.RotationYawPitchRollToRef(Math.PI - yawHeading, 0, 0, yawFrame);
                return yawFrame;
            }
            if (nextMode !== 'momentum') {
                mode = nextMode;
                return nextMode === 'aircraft' ? null : frame(0, 0);
            }
            if (mode !== nextMode) {
                heading = targetHeading = aircraftHeading = state.headingRad;
                pitch = targetPitch = 0;
                momentumVelocity = 0;
                current = frame(heading, pitch);
            }
            mode = nextMode;
            const north = state.northVelocityFps * .3048, east = state.eastVelocityFps * .3048, up = state.verticalSpeedFps * .3048;
            const horizontal = Math.hypot(north, east), speed = Math.hypot(horizontal, up);
            if (Number.isFinite(speed)) {
                const course = confidence(horizontal, .9, 1.2);
                // Without a course, turn with the aircraft.
                if (Number.isFinite(state.headingRad)) targetHeading += wrap(state.headingRad - aircraftHeading) * (1 - course);
                targetHeading += wrap(Math.atan2(east, north) - targetHeading) * course;
                const measuredPitch = Math.max(-MOMENTUM_PITCH_LIMIT, Math.min(MOMENTUM_PITCH_LIMIT, Math.atan2(up, horizontal)));
                targetPitch += (measuredPitch - targetPitch) * confidence(speed, .9, 1.2);
            }
            if (Number.isFinite(state.headingRad)) aircraftHeading = state.headingRad;
            // Smooth the two angles, then construct a zero-roll frame. Quaternion slerp
            // between changing heading AND pitch introduces unwanted bank in between.
            const alpha = 1 - Math.exp(-Math.max(0, Math.min(dt, .1)) / .25);
            const previousHeading = heading;
            heading = wrap(heading + wrap(targetHeading - heading) * alpha);
            if (Number.isFinite(dt) && dt > 0) momentumVelocity = wrap(heading - previousHeading) / Math.min(dt, .1);
            targetHeading = heading + wrap(targetHeading - heading);
            pitch += (targetPitch - pitch) * alpha;
            Quaternion.RotationYawPitchRollToRef(Math.PI - heading, -pitch, 0, current);
            // Keep easing to the stored target after motion fades; never freeze mid-turn.
            return current;
        },
    };
}
