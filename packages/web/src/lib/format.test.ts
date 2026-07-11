import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

const NBSP = " ";

describe("formatMoney", () => {
  it("formats with Greek grouping and decimal separators", () => {
    expect(formatMoney(1234.5)).toBe(`1.234,50${NBSP}€`);
  });
  it("accepts the API's numeric strings", () => {
    expect(formatMoney("1234.5")).toBe(`1.234,50${NBSP}€`);
  });
  it("always shows two decimals", () => {
    expect(formatMoney(12)).toBe(`12,00${NBSP}€`);
  });
});
