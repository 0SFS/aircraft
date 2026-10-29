import type { TransformNode } from "@babylonjs/core";

/** The lazy drone feature registers this. The aircraft package never imports the feature. */
export interface DroneMeshMount {
  mount(modelRoot: TransformNode): () => void;
  dispose(): void;
}

let mount: DroneMeshMount | null = null;

export function setDroneMeshHook(next: DroneMeshMount | null): void {
  mount = next;
}

export function droneMeshHook(): DroneMeshMount | null {
  return mount;
}
