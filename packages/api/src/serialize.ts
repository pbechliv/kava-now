// Bridges the gap between a handler's pre-serialization object and the shared
// wire contract it must satisfy. Drizzle types `timestamp` columns as `Date`,
// but the shared response types model them as `string` (their JSON form). This
// maps every `string`-typed field in the contract to also accept `Date`, so a
// handler's row can be `satisfies PreSerialize<ResponseType>`-checked: field
// names, enums (literal-string unions stay strict), and numeric vs string
// columns are all still enforced — only the Date→string serialization is
// tolerated.
export type PreSerialize<T> = string extends T
  ? T | Date
  : T extends readonly (infer U)[]
    ? PreSerialize<U>[]
    : T extends object
      ? { [K in keyof T]: PreSerialize<T[K]> }
      : T;
