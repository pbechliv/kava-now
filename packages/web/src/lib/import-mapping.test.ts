import { describe, expect, it } from "vitest";
import { applyMapping, suggestMapping } from "./import-mapping";

describe("suggestMapping", () => {
  it("maps Greek headers", () => {
    const result = suggestMapping(["Όνομα", "Μάρκα", "Τιμή"]);
    expect(result.name).toBe("Όνομα");
    expect(result.brand).toBe("Μάρκα");
    expect(result.basePrice).toBe("Τιμή");
  });
  it("maps English headers", () => {
    const result = suggestMapping(["Name", "Brand", "Price", "Category"]);
    expect(result.name).toBe("Name");
    expect(result.brand).toBe("Brand");
    expect(result.basePrice).toBe("Price");
    expect(result.categoryName).toBe("Category");
  });
  it("doesn't reuse a column for two targets", () => {
    const result = suggestMapping(["Name", "Brand", "Price"]);
    const values = Object.values(result);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("applyMapping", () => {
  it("produces valid ImportProductRow for well-formed input", () => {
    const rows = [{ Name: "Whisky 12y", Brand: "Glenfiddich", Price: "45,90" }];
    const applied = applyMapping(rows, {
      name: "Name",
      brand: "Brand",
      basePrice: "Price",
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.error).toBeNull();
    expect(applied[0]?.row).toEqual({
      name: "Whisky 12y",
      brand: "Glenfiddich",
      basePrice: 45.9,
    });
  });

  it("reports an error when a required field is missing", () => {
    const rows = [{ Name: "Whisky", Brand: "", Price: "10" }];
    const applied = applyMapping(rows, {
      name: "Name",
      brand: "Brand",
      basePrice: "Price",
    });
    expect(applied[0]?.row).toBeNull();
    expect(applied[0]?.error).toBeTruthy();
  });

  it("rejects negative price", () => {
    const rows = [{ Name: "X", Brand: "Y", Price: "-1" }];
    const applied = applyMapping(rows, {
      name: "Name",
      brand: "Brand",
      basePrice: "Price",
    });
    expect(applied[0]?.row).toBeNull();
    expect(applied[0]?.error).toMatch(/basePrice/);
  });

  it("normalises unit aliases", () => {
    const rows = [{ Name: "X", Brand: "Y", Price: "10", U: "κιβώτιο" }];
    const applied = applyMapping(rows, {
      name: "Name",
      brand: "Brand",
      basePrice: "Price",
      unit: "U",
    });
    expect(applied[0]?.row?.unit).toBe("case");
  });

  it("coerces Greek booleans for active", () => {
    const rows = [{ Name: "X", Brand: "Y", Price: "10", On: "ΟΧΙ" }];
    const applied = applyMapping(rows, {
      name: "Name",
      brand: "Brand",
      basePrice: "Price",
      active: "On",
    });
    expect(applied[0]?.row?.active).toBe(false);
  });
});
