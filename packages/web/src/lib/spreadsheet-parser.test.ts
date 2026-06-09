import { describe, expect, it } from "vitest";
import { parseBool, parseFile, parseInteger, parsePrice } from "./spreadsheet-parser";

function makeFile(content: BlobPart, name: string, type = "text/csv"): File {
  return new File([content], name, { type });
}

describe("parsePrice", () => {
  it("parses plain integer", () => {
    expect(parsePrice("42")).toBe(42);
  });
  it("parses dot decimal", () => {
    expect(parsePrice("12.50")).toBe(12.5);
  });
  it("parses comma decimal", () => {
    expect(parsePrice("12,50")).toBe(12.5);
  });
  it("parses Greek locale with thousand separator", () => {
    expect(parsePrice("1.234,56")).toBe(1234.56);
  });
  it("parses English locale with thousand separator", () => {
    expect(parsePrice("1,234.56")).toBe(1234.56);
  });
  it("strips currency suffix", () => {
    expect(parsePrice("12,50 €")).toBe(12.5);
    expect(parsePrice("€12.50")).toBe(12.5);
  });
  it("returns null for non-numeric", () => {
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
  it("treats pure 3-digit grouping as thousands, not decimals (#69)", () => {
    expect(parsePrice("1.234")).toBe(1234); // Greek thousands
    expect(parsePrice("1,234")).toBe(1234); // English thousands
    expect(parsePrice("12.345.678")).toBe(12345678);
    // …but real decimals and mixed forms stay intact.
    expect(parsePrice("1.23")).toBe(1.23);
    expect(parsePrice("1.2345")).toBe(1.2345);
    expect(parsePrice("1.234,56")).toBe(1234.56);
  });
});

describe("parseInteger", () => {
  it("truncates fractional", () => {
    expect(parseInteger("12,9")).toBe(12);
  });
  it("returns null for non-numeric", () => {
    expect(parseInteger("xx")).toBeNull();
  });
});

describe("parseBool", () => {
  it("recognises Greek truthy", () => {
    expect(parseBool("ΝΑΙ")).toBe(true);
    expect(parseBool("ναι")).toBe(true);
  });
  it("recognises Greek falsy", () => {
    expect(parseBool("ΟΧΙ")).toBe(false);
    expect(parseBool("όχι")).toBe(false);
  });
  it("recognises booleans", () => {
    expect(parseBool("true")).toBe(true);
    expect(parseBool("false")).toBe(false);
    expect(parseBool(0)).toBe(false);
    expect(parseBool(1)).toBe(true);
  });
  it("returns null for unknown", () => {
    expect(parseBool("maybe")).toBeNull();
    expect(parseBool("")).toBeNull();
  });
});

describe("parseFile (CSV)", () => {
  it("parses a UTF-8 CSV with BOM and Greek headers", async () => {
    const csv = "﻿Όνομα,Μάρκα,Τιμή\nWhisky 12y,Glenfiddich,45,90\n";
    const file = makeFile(csv, "products.csv");
    const result = await parseFile(file);
    expect(result.columns).toEqual(["Όνομα", "Μάρκα", "Τιμή"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.["Όνομα"]).toBe("Whisky 12y");
    // Note: papaparse treats the second comma as a column delimiter, so "45,90"
    // becomes column 3 = "45" and an extra column = "90". Locale handling
    // happens later, in applyMapping → parsePrice. Here we just verify headers
    // and that rows survive parsing.
  });

  it("honours skipFirstRows", async () => {
    const csv = "Title row,,\nAnother,,\nName,Brand,Price\nFoo,Bar,10\n";
    const file = makeFile(csv, "products.csv");
    const result = await parseFile(file, { skipFirstRows: 2 });
    expect(result.columns).toEqual(["Name", "Brand", "Price"]);
    expect(result.rows[0]).toEqual({ Name: "Foo", Brand: "Bar", Price: "10" });
  });
});

describe("parseFile (XLSX)", () => {
  async function xlsxFile(aoa: unknown[][]): Promise<File> {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new File([buf], "products.xlsx");
  }

  it("parses a plain sheet", async () => {
    const file = await xlsxFile([
      ["Name", "Brand", "Price"],
      ["Whisky 12y", "Glenfiddich", "45,90"],
    ]);
    const result = await parseFile(file);
    expect(result.columns).toEqual(["Name", "Brand", "Price"]);
    expect(result.rows).toEqual([{ Name: "Whisky 12y", Brand: "Glenfiddich", Price: "45,90" }]);
  });

  it("an empty interior header cell must not shift later columns' values", async () => {
    const file = await xlsxFile([
      ["Name", "", "Price"],
      ["Fix", "junk-unnamed", "12,50"],
    ]);
    const result = await parseFile(file);
    expect(result.columns).toEqual(["Name", "Price"]);
    // Regression (#43): Price used to receive the unnamed column's value.
    expect(result.rows).toEqual([{ Name: "Fix", Price: "12,50" }]);
  });

  it("duplicate header names: rightmost column wins, no positional shift", async () => {
    const file = await xlsxFile([
      ["Name", "Name", "Price"],
      ["first", "second", "5"],
    ]);
    const result = await parseFile(file);
    expect(result.columns).toEqual(["Name", "Name", "Price"]);
    expect(result.rows).toEqual([{ Name: "second", Price: "5" }]);
  });

  it("honours skipFirstRows and drops empty rows", async () => {
    const file = await xlsxFile([
      ["Export title", "", ""],
      ["Name", "Brand", "Price"],
      ["Foo", "Bar", "10"],
      ["", "", ""],
    ]);
    const result = await parseFile(file, { skipFirstRows: 1 });
    expect(result.columns).toEqual(["Name", "Brand", "Price"]);
    expect(result.rows).toEqual([{ Name: "Foo", Brand: "Bar", Price: "10" }]);
  });
});
