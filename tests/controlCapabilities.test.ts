import { describe, expect, it } from "vitest";
import { resolveControlCapabilities } from "../src/aircraftCatalog";

describe("airframe control capabilities", () => {
  it("preserves older plane controls and defaults drone hardware to absent", () => {
    expect(resolveControlCapabilities({})).toEqual({ flaps: true, pitchTrim: true, rollTrim: true, landingGear: true });
    expect(resolveControlCapabilities({}, true)).toEqual({ flaps: false, pitchTrim: false, rollTrim: false, landingGear: false });
  });

  it("lets a future drone declare retractable landing gear independently", () => {
    expect(resolveControlCapabilities({ controls: { vertical: "climb-rate", landingGear: true } }, true))
      .toEqual({ flaps: false, pitchTrim: false, rollTrim: false, landingGear: true });
    expect(resolveControlCapabilities({ controls: { landingGear: false, rollTrim: false } }))
      .toEqual({ flaps: true, pitchTrim: true, rollTrim: false, landingGear: false });
  });
});
