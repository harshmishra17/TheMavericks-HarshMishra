import { describe, it, expect } from "vitest";
import {
  total,
  actualTotal,
  defaultTerms,
  buildBrief,
  termsSchema,
} from "../../src/lib/domain";
describe("integer money and explicit scope", () => {
  it("computes 450 rupees in paise", () =>
    expect(total(defaultTerms)).toBe(45000));
  it("supports the 400 rupee counter without mutating original", () => {
    const t = structuredClone(defaultTerms);
    t.items[1].amount = 20000;
    expect(total(t)).toBe(40000);
    expect(total(defaultTerms)).toBe(45000);
  });
  it("rejects negative values, decimals and excessive credits", () => {
    for (const amount of [-1, 0.5, 10000001]) {
      const t = structuredClone(defaultTerms);
      t.items[0].amount = amount;
      expect(() => total(t)).toThrow();
    }
    expect(() => total({ ...defaultTerms, credit: 45001 })).toThrow();
  });
  it("rejects duplicate ids", () =>
    expect(
      termsSchema.safeParse({
        ...defaultTerms,
        items: [defaultTerms.items[0], defaultTerms.items[0]],
      }).success,
    ).toBe(false));
  it("rejects material overspend even under overall cap", () => {
    const t = structuredClone(defaultTerms);
    t.items[0].amount = 0;
    t.items[2].amount = 15000;
    expect(() => actualTotal(defaultTerms, t)).toThrow();
  });
  it("permits lower actual materials", () => {
    const t = structuredClone(defaultTerms);
    t.items[2].amount = 5000;
    expect(actualTotal(defaultTerms, t)).toBe(40000);
  });
  it("inspection does not authorise repair", () =>
    expect(() =>
      actualTotal({ ...defaultTerms, mode: "inspection" }, defaultTerms),
    ).toThrow());
  it("retains unknowns and source text without diagnosis", () => {
    const text = buildBrief("नल टपक रहा है", {});
    expect(text).toContain("नल टपक रहा है");
    expect(text).toContain("Cause is unknown");
    expect(text).toContain("Fitting: Unknown");
    expect(text).not.toContain("broken washer");
  });
});
