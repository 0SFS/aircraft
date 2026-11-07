# Optimistic-inclusion culling for aircraft parts, measured — 7 November 2026

Step 1 of [prompt 09](https://github.com/0SFS/fly/blob/main/docs/performance/2026-11-05/prompts/09-f35b-draws.md)
of fly's 5 November phone audit. Status: **no gain, not built**. Production
source and tests are unchanged. Ledger: P-135. Baseline: aircraft `6e79e6b`,
Babylon 8.56.2.

## The proposal

The prompt proposed setting `cullingStrategy` to optimistic inclusion on the
aircraft's parts. It said the parts would then skip the box test, with the
same parts culled.

## What Babylon does

- Babylon 8.56.2's default for a mesh is
  `CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY` (`Meshes/abstractMesh.js`). It tests
  the bounding sphere against the frustum and never tests the box. The F-35B's
  260 loaded parts all have this default.
- Optimistic inclusion (`Culling/boundingInfo.js`) accepts a mesh whose
  sphere's centre is in the frustum. Otherwise it tests the sphere, then the
  box. That is the standard strategy with a shortcut, so it culls what the
  standard test culls.
- The box test is stricter than the sphere test. So the change would cull
  more parts, not the same ones.

## On the real F-35B

Scratch is in the ignored `build/culling/`. `f35b.mjs` loads the airframe and
the installed F135 GLBs, as fly serves them, into a `NullEngine` scene in
Node 26.9.0, at 1920 × 1080. That is 260 parts with vertices. None are
skinned or morphed. There are three camera paths of 2,000 frames each:

- **Cockpit:** at fly's `cockpitOffset` for the F-35B, looking around.
- **Chase:** 16 to 28 m behind and above.
- **Orbit:** all around at 6 to 18 m.

For each part in each frame, it records the answer of the default, standard
and optimistic tests. When the box test rejects a part the sphere test keeps,
it transforms every vertex of that part to world space. It then checks each
vertex against the plane that rejects the box.

Parts kept per frame:

| | Default (sphere) | Box (standard, optimistic) | Fewer |
| --- | ---: | ---: | ---: |
| Cockpit | 16.24 | 12.26 | 3.98 |
| Chase | 260 | 260 | 0 |
| Orbit | 240.99 | 239.07 | 1.91 |

- The standard and optimistic tests agreed in every frame.
- The box test never kept a part the sphere test rejected.
- The parts it dropped included the nose doors, slats, rudders and the
  F135's aft parts.
- None of their 2,605,218 vertices checked lay inside the rejecting plane.
  Those parts would draw no pixels, so the image would be the same.

`f35b-time.mjs` times Babylon's `_evaluateActiveMeshes` with one strategy on
every part. It runs 4,000 frames after 1,000 warm-up frames, in interleaved
processes. Median (range), in µs a frame:

| | Default | Optimistic | Standard |
| --- | ---: | ---: | ---: |
| Cockpit | 33.7 (32.6–34.5) | 35.0 (34.0–36.2) | 33.6 (33.4–34.5) |
| Chase | 52.1 (49.2–54.7) | 50.8 (50.5–52.4) | 58.1 (57.3–59.9) |

The default has 10 runs per row; the others have 5 each.

## Why not built

- In the chase view, where the audit measured the F-35B's 2.2 ms of render
  CPU on the M5, every part is in view. No culling strategy can save a draw
  there.
- In the cockpit view, about 4 draws a frame would go. The audit's 2.2 ms
  for about 260 draws is about 8.5 µs a draw on the M5. That makes roughly
  30 µs a frame, an estimate not measured in a browser.
- The test itself costs the same within about 1 µs either way.
- A synthetic 561-mesh scene (`culling.mjs`, the exhaust's P-134 scene)
  agrees. The box test drops 24 of 260 parts a frame in a cockpit-like view
  and none in the chase view. The evaluation time is the same within noise.

These are Node timings on a `NullEngine`, not frame-rate claims.

## Left

- The F-35B's draws in the chase view can only be cut by drawing fewer
  meshes, for example with prompt 09's step 2 (the nozzle's 112 flap segments
  as 7 instanced meshes) or step 3 (merging static parts). Those are
  validated by images, not proved exact.
- If the cockpit view's draws ever matter, the standard strategy on the
  parts is exact in pixels for this model, by the vertex check above. It
  would need the same check in the app's real flight, with the gear, doors
  and nozzle moving.
