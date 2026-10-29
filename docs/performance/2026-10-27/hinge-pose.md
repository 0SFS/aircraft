# Hinge pose reuse — 27 October 2026

Status: retained. Exact poses, no FOSS Earth or ground-contact edits.

`applyAircraftRig` built a new quaternion for every surface, gear link, door,
wheel, petal and propeller on every frame, then assigned it. A repeated angle
now keeps the quaternion already on the node and does not mark that node dirty.
A new angle is written into the same quaternion.

The comparison is six interleaved pairs of 4,000 frames on a NullEngine F-35B
rig: steady surfaces, gear and STOVL, creeping nozzle petals (`+6.8e-9` per
frame) and a still propeller. Legacy is the previous allocating writes on the
same rig fields. Scratch runner: `build/pose-bench.test.ts`.

| Pair | Legacy ms | Current ms | Current / legacy |
| ---: | ---: | ---: | ---: |
| 1 | 5.67 | 3.47 | 0.612 |
| 2 | 5.09 | 2.72 | 0.535 |
| 3 | 5.14 | 2.69 | 0.524 |
| 4 | 4.89 | 2.77 | 0.566 |
| 5 | 5.00 | 2.72 | 0.543 |
| 6 | 4.99 | 3.11 | 0.623 |

Median ratio 0.566. At 60 fps that is about 0.03 ms/s. It is not an FPS, power
or whole-flight claim. World-matrix work from a moving aircraft root is outside
this loop.

Component checks use `Object.is` against `rest.multiply(Quaternion.RotationAxis(...))`,
including the three-step main-gear product and pitch-then-yaw. A second identical
apply does not call `Quaternion.RotationAxis` and keeps the same quaternion
objects. Focused aircraft, F-35B and nozzle suites passed.
