# Wheel rotation after liftoff

The visible wheel animation previously computed its rate as ground speed divided
by radius only while any gear had weight on wheels. Airborne it assigned zero
speed, froze the angle and immediately removed tire blur. A regression test even
required that freeze. This was independent of the wheel-spin experiment, which
retained angular speed but did not drive the aircraft mesh.

Each mesh now retains its own angular state and uses the shared ground-contact
wheel-spin kernel. The baseline still matches rolling speed immediately on the
ground; airborne it coasts using the existing exponential drag model. Blur uses
retained angular speed. Each wheel uses its own measured mesh radius. A held
simulation freezes state. No extra raycasts, mesh draws or physics substeps are
introduced; state and input objects are allocated at rig binding, not per step.
This is a bounded per-wheel update, not a measured frame-time improvement.

For the C172 with the experiment enabled, the app supplies the fixed-step
nose/left/right wheel states directly. Mesh angle and blur then use that state
without integrating it a second time. Brakes, individual contact, and touchdown
spin-up follow the experimental model. Its C172 parameters must not be passed
to a jet as if they were measured jet assembly properties.

## Remaining physical accuracy work

The baseline retains instant rolling and aggregate weight-on-wheels; it does not
model individual spin-up. Airborne braking reads the applied left/right JSBSim
commands; brakes stop the mains, while the unbraked nose wheel coasts. The experimental model is one-way
visual/audio feedback. It does not remove spin-up energy from the aircraft or
replace JSBSim braking. The installed contact speed property is contact motion,
not an angular state that can be used airborne.

For physical coupling, retain angular momentum L = I omega per wheel and evolve
it from contact, brake and bearing/aerodynamic torques. Airborne, contact torque
is zero; ground speed must never overwrite angular velocity. Ground friction
must act equally and oppositely on wheel and airframe, including moments, while
replacing the corresponding existing JSBSim friction to avoid double counting.
Use the existing bounded coupled-wheel solver and native contact contract rather
than adding another collision pass or unconstrained integration loop.

## F-35B suspension and contact alignment

The F-35B lower suspension assemblies now follow actual native gear compression,
independently of the C172 wheel-spin experiment. The shipped asset represents a
loaded pose, so binding measures each tire's lowest vertex once in asset space,
excluding the presentation root's placement. The difference from the native
uncompressed contact is the extension calibration. Each update translates the
complete `noseSuspension`, `leftSuspension` or `rightSuspension` lower assembly,
including its wheel and lower strut, by that calibration plus physical
compression. It does not lift the aircraft or scan vertices during a frame.

Compression is zero for a gear without weight on wheels, even if stale native
compression telemetry remains. The physical gear position blends the correction
back to zero during retraction, preserving the authored fully stowed geometry.
Missing native contact/CG data leaves the authored pose. Paused presentation can
follow an explicit native reset, but does not integrate suspension travel.

Native F-35B contact x/y stations now follow the extended axle/tread centres in
the distributed mesh. Overall wheel bounding boxes are unsuitable lateral
references because they include asymmetric hubs. Native uncompressed z and
spring/damper coefficients are retained; this is a geometric fit to the asset,
not a manufacturer landing-gear model. The current correction follows body-up;
full strut kinematics and force-normal projection on arbitrary slopes remain
approximations of the single-plane contact model.

Aircraft-specific radii, assembly inertias and loss torques need calibration.
The existing C172 inertias and brake torques are estimates; the 20-second coast
time is an authored damping constant, not measured bearing or aerodynamic drag.
The airborne spin kernel also integrates angle using the pre-drag speed before
applying exponential decay to velocity; an analytic combined drag/brake update
in both TypeScript and Rust would improve timestep consistency. These are
separate from the abrupt visual stop corrected here.
