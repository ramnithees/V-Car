import { describe, it, expect } from "vitest";
import { checkDeleteAllowed, describeDeleteError } from "@/lib/delete-guard";

describe("delete guard — dependent simulations block road/vehicle deletion", () => {
  it("blocks a road that has dependent simulations", () => {
    const res = checkDeleteAllowed("road", 3);
    expect(res.allowed).toBe(false);
    expect(res.message).toBe("3 simulations use this road — delete or reassign them first");
  });

  it("blocks a vehicle that has exactly one dependent simulation (singular wording)", () => {
    const res = checkDeleteAllowed("vehicle", 1);
    expect(res.allowed).toBe(false);
    expect(res.message).toBe("1 simulation uses this vehicle — delete or reassign it first");
  });

  it("allows deletion when there are no dependents", () => {
    expect(checkDeleteAllowed("road", 0)).toEqual({ allowed: true, message: "" });
    expect(checkDeleteAllowed("vehicle", 0)).toEqual({ allowed: true, message: "" });
  });

  it("treats an unknown/pending count as deletable (server still enforces RESTRICT)", () => {
    expect(checkDeleteAllowed("road", null).allowed).toBe(true);
    expect(checkDeleteAllowed("vehicle", undefined).allowed).toBe(true);
  });

  it("translates a Postgres FK violation into the same guidance", () => {
    const err = Object.assign(new Error("update or delete violates foreign key constraint"), {
      code: "23503",
    });
    expect(describeDeleteError("road", err)).toBe(
      "This road is still used by saved simulations — delete or reassign them first",
    );
  });

  it("passes through unrelated errors unchanged", () => {
    expect(describeDeleteError("vehicle", new Error("network down"))).toBe("network down");
  });
});
