import { Quaternion } from '@babylonjs/core';
export type CameraFollowMode = 'aircraft' | 'momentum' | 'planet';
export interface FollowState {
    headingRad: number;
    northVelocityFps: number;
    eastVelocityFps: number;
    verticalSpeedFps: number;
}
export const MOMENTUM_PITCH_LIMIT = 85 * Math.PI / 180;
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
/** Momentum holds its last reliable direction at hover and its heading in vertical flight. */
export function createCameraFollow() {
    let heading = 0, pitch = 0, targetHeading = 0, targetPitch = 0;
    let current = frame(0, 0);
    let mode: CameraFollowMode | null = null;
    return {
        update(nextMode: CameraFollowMode, state: FollowState, dt: number): Quaternion | null {
            if (nextMode !== 'momentum') {
                mode = nextMode;
                return nextMode === 'aircraft' ? null : frame(0, 0);
            }
            if (mode !== nextMode) {
                heading = targetHeading = state.headingRad;
                pitch = targetPitch = 0;
                current = frame(heading, pitch);
            }
            mode = nextMode;
            const north = state.northVelocityFps * .3048, east = state.eastVelocityFps * .3048, up = state.verticalSpeedFps * .3048;
            const horizontal = Math.hypot(north, east), speed = Math.hypot(horizontal, up);
            if (Number.isFinite(speed)) {
                targetHeading += wrap(Math.atan2(east, north) - targetHeading) * confidence(horizontal, .9, 1.2);
                const measuredPitch = Math.max(-MOMENTUM_PITCH_LIMIT, Math.min(MOMENTUM_PITCH_LIMIT, Math.atan2(up, horizontal)));
                targetPitch += (measuredPitch - targetPitch) * confidence(speed, .9, 1.2);
            }
            // Smooth the two angles, then construct a zero-roll frame. Quaternion slerp
            // between changing heading AND pitch introduces unwanted bank in between.
            const alpha = 1 - Math.exp(-Math.max(0, Math.min(dt, .1)) / .25);
            heading = wrap(heading + wrap(targetHeading - heading) * alpha);
            targetHeading = heading + wrap(targetHeading - heading);
            pitch += (targetPitch - pitch) * alpha;
            Quaternion.RotationYawPitchRollToRef(Math.PI - heading, -pitch, 0, current);
            // Keep easing to the stored target after motion fades; never freeze mid-turn.
            return current;
        },
    };
}
