# Aircraft selection UI

Updated 2026-10-21. This replaces the earlier radio-gallery, staged Apply and
page-reload acceptance notes.

The persistence root cause and runtime lifecycle are retained in
[the flight implementation handoff](../../../fly/docs/aircraft-switching.md).

## Selecting and editing

The Aircraft tab starts with a compact paragraph grid containing the loaded
aircraft's thumbnail, name and **Switch**. One visible rounded rectangle encloses
the three elements, following the shared matryoshka ownership rule. The thumbnail
comes from that aircraft family's artwork instead of a generic plane icon. Its
default view edits that aircraft. The airspeed, altitude, heading and throttle
readouts have been removed from this tab.

**Switch** opens a bounded image gallery and hides the loaded aircraft's summary
and editing controls. Other aircraft are named native buttons, with no radio
circles. The current aircraft's card shows its thumbnail, exact loaded name,
**Currently loaded** status and a compact **Edit** label at the bottom right.
The whole current-aircraft card is one native **Edit** button: its image, name,
status, background and Edit label all return to the loaded aircraft's controls
without confirmation or activation. Enter and Space use the same action, with
no nested button. There is no duplicate image/name/Edit row above the gallery. Images
are decorative, and a failed thumbnail leaves the named card and its fallback
usable. The switch warning also uses the target aircraft's thumbnail.

Clicking a different aircraft opens a fullscreen native warning dialog. **Cancel**
or Escape keeps the current aircraft. **Confirm** starts the switch immediately,
without Apply, a pending-changes banner or a page reload. **Don't show again** is
saved when the warning is confirmed, under
`0sfs.aircraft-switch.skip-confirmation`; later card choices start immediately.
Cancelling a checked warning does not save that preference.

During a switch the flight stays paused, aircraft controls are disabled, and a
circular progress indicator occupies the aircraft's former screen position. The
runtime must finish preparing the complete aircraft and loading its mesh before
the switch promise resolves and flight can resume. A failure opens a fullscreen
error report. The selector displays reports returned or thrown by its activation
callback; failures after its old panel has been disposed are displayed by the
runtime's stable error-dialog host.

Model detail changes apply directly to the loaded aircraft. A generation change
that selects another runtime package uses the same confirmation flow. The Vision
Jet offers G1, G2, G2+ and G3; G2+ currently uses the G2 runtime. Model credits,
source links, triangle counts and exact active model status remain under the
compact **?** disclosure. The generation and LOD controls, including available HD
choices, remain available in the editing view.
Model inspection is collapsed at the end of the editing view so its mesh tree
does not crowd the flight controls.

## Checks and their scope

The selector's focused React suite contains 29 passing tests:

```sh
cd ../fly
npm test -- src/flight/hud/AircraftSelectionPanel.test.tsx
```

It covers separate editing/switching views, confirmation, Cancel and Escape,
persisted warning suppression, disabling controls while activation is pending,
returned and thrown diagnostic reports, direct model-detail changes, generation
confirmation, active model status/attribution, failed-thumbnail fallback, live
snapshot edits and modal keyboard isolation without trapping held-key releases.
It also verifies distinct family thumbnails, the compact action labels, and the
current gallery card's Edit action from each card region. The selector and
aircraft panel test files together passed 31 tests after the whole-card change.

The headless static UI check passed at 1440×900, 360×760 and 740×360 on 2026-10-21:

```sh
cd ../fly
node ../aircraft/scripts/check-aircraft-selection-headless.mjs
```

It builds the real selector with the real fleet and production CSS inside a
small static panel shell. A controlled promise allows deterministic loading and
failure states. The check uses headless Chrome through its debugging pipe; it
starts no server and makes no external network requests. It verifies:

- Native gallery buttons with no radio inputs, separate editing controls and
  bounded scrolling.
- An enclosing rounded border around thumbnail/name/Switch, no repeated summary
  in the gallery, and an Edit label at the current card's bottom right. Clicking
  the card's image, name, status or Edit label, or using its keyboard action,
  returns to editing without applying another aircraft.
- Fullscreen native warning/error dialogs, contained keyboard focus, Escape
  cancellation and 44 px dialog action targets at all three viewport sizes.
- One confirmation starting activation immediately; disabled controls until the
  controlled activation promise finishes.
- The diagnostic report, warning-suppression preference, direct LOD changes and
  absence of Apply/reload/pending controls throughout the flow.

The final run's JSON report and fifteen screenshots are under
`../fly/build/validation/aircraft-selection/2026-10-21_152810/`. Every viewport
passed, with no browser exceptions or request failures. The narrow gallery and
warning and the short error dialog were also visually inspected. The output is
local, gitignored acceptance evidence; each run creates a new directory, and an
explicit `--out=<new-directory>` can select another location.

This static check does **not** prove real physics replacement, successful GLB
loading, pause gating, terrain readiness, retained world/canvas state or flight
fidelity. Those require the production-runtime switch check and runtime tests.
Its controlled snapshots must not be cited as evidence that another aircraft
actually became flyable. The full FlightControlPanel integration tests separately
cover removal of the tab's flight metrics and hiding its other editing sections
while the gallery is open.

The full application check also passed on 2026-10-21:

```sh
cd ../fly
npm run check:aircraft-switch
```

It uses real JSBSim/WASM, aircraft data and GLB meshes with an offline fallback
globe. Every runtime (C172, Vision Jet G1/G2/G3 and F-35B) reached model-ready
state with matching physics identity while keeping the same document, canvas,
renderer and world. A held download blocked resume. A deliberately missing
required F-35B airframe opened an error report, recovered the previous aircraft
paused, and then succeeded on retry. An intentional reload restored the saved
aircraft. The report and loading, failure and final-state screenshots are under
`../fly/build/validation/aircraft-switch/2026-10-21_122717/`, with no browser
exceptions or unexpected external requests. This check does not qualify live map
streaming, aircraft performance or terrain fidelity.

## Source navigation

- `src/AircraftSelectionPanel.tsx`: current-aircraft row, separate gallery,
  generation/LOD editing, native dialogs, warning preference and diagnostic report.
- `src/aircraftCatalog.ts`: families, runtime IDs, variants and selection normalization.
- `../fly/src/flight/aircraft/fleet.ts`: assembled fleet, thumbnail metadata,
  LOD capabilities, model credits and development disclosures.
- `../fly/src/flight/hud/FlightControlPanel.tsx`: aircraft tab and remaining flight controls.
- `../fly/src/flight/createFlightSimApp.ts`: persistence and complete runtime activation.
- `../fly/src/styles/flight.css`: compact controls, responsive gallery, fullscreen
  dialogs and loading indicator.
- `scripts/check-aircraft-selection-headless.mjs`: reproducible static selector
  layout/interaction evidence with screenshots and JSON report.

The UI checks do not validate SF50 generation-specific performance, F-35B STOVL
behavior, cabin differences or avionics completeness. The family disclosures and
existing aircraft calibration evidence remain applicable.
