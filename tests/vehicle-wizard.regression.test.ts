import { describe, expect, it } from "vitest";
import { INITIAL, toInsertRow, type VehicleWizardData } from "@/components/vehicles/wizard/types";
import { validateAll, validateStep } from "@/components/vehicles/wizard/validation";

describe("vehicle wizard validation", () => {
  it("rejects empty required Basic Info", () => {
    const bad: VehicleWizardData = { ...INITIAL, name: "", manufacturer: "" };
    const r = validateStep(0, bad);
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.manufacturer).toBeTruthy();
  });

  it("passes a plausible sedan across every step", () => {
    const r = validateAll({ ...INITIAL, name: "TestCar", manufacturer: "Acme" });
    expect(r.ok).toBe(true);
  });

  it("blocks idle_rpm >= max_rpm", () => {
    const r = validateStep(1, { ...INITIAL, idle_rpm: 8000, max_rpm: 6500 });
    expect(r.errors.idle_rpm).toBeTruthy();
  });

  it("blocks GVW below kerb", () => {
    const r = validateStep(3, { ...INITIAL, mass_kg: 2000, gvw_kg: 1500 });
    expect(r.errors.gvw_kg).toBeTruthy();
  });

  it("blocks implausible power-to-weight", () => {
    const r = validateAll({
      ...INITIAL,
      name: "x",
      manufacturer: "y",
      power_value: 5,
      mass_kg: 60000,
    });
    expect(r.ok).toBe(false);
  });

  it("maps mm to m and HP to kW in insert row", () => {
    const row = toInsertRow(
      {
        ...INITIAL,
        name: "x",
        manufacturer: "y",
        power_unit: "HP",
        power_value: 200,
        wheelbase_mm: 2800,
        front_track_mm: 1600,
        rear_track_mm: 1600,
      },
      "owner-1",
    );
    expect(row.wheelbase_m).toBeCloseTo(2.8, 3);
    expect(row.track_m).toBeCloseTo(1.6, 3);
    expect(row.max_power_kw).toBeCloseTo(200 * 0.7457, 3);
    expect(row.owner_id).toBe("owner-1");
  });
});
