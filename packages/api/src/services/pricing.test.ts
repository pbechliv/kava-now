import { describe, expect, it } from "vitest";
import { resolvePrice } from "./pricing";

describe("resolvePrice (integer-cent discount math)", () => {
  it("no discount → base price", () => {
    expect(resolvePrice("12.50", null)).toBe(12.5);
  });

  it("0% discount → base price", () => {
    expect(resolvePrice("12.50", "0")).toBe(12.5);
  });

  it("100% discount → 0", () => {
    expect(resolvePrice("12.50", "100.00")).toBe(0);
  });

  it("plain percentage", () => {
    expect(resolvePrice("10.00", "25.00")).toBe(7.5);
  });

  it("regression (#54): half-cent results round half-up, not down via float error", () => {
    // 2.01 * 0.5 = 1.005 → 1.01. The old float path produced 1.00.
    expect(resolvePrice("2.01", "50.00")).toBe(1.01);
    // 0.05 * 0.5 = 0.025 → 0.03.
    expect(resolvePrice("0.05", "50.00")).toBe(0.03);
  });

  it("fractional discount percentages stay exact", () => {
    // 19.99 * (1 - 0.1275) = 17.4412... → 17.44
    expect(resolvePrice("19.99", "12.75")).toBe(17.44);
  });
});
