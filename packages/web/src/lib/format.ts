// Display formatting for the Greek UI — single source of truth so a locale
// or currency change doesn't mean hunting down inline toFixed/toLocale calls.

const LOCALE = "el-GR";

const moneyFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
});

/** "1.234,50 €" with a non-breaking space; accepts the API's numeric strings. */
export function formatMoney(value: string | number): string {
  return moneyFormat.format(Number(value));
}

/** "12/6/2026" */
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE);
}

/** "12/6/2026, 14:30:00" */
export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(LOCALE);
}

/** "12 Ιουνίου 2026, 14:30" */
export function formatDateLong(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
