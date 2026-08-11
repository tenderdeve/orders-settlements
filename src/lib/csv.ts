/**
 * Minimal RFC 4180 writer with one addition: CSV injection defence.
 *
 * A spreadsheet treats a cell beginning `=`, `+`, `-` or `@` as a formula, so a
 * customer named `=cmd|'/c calc'!A1` becomes code the moment someone opens the
 * export. Prefixing an apostrophe forces it back to text. This matters here
 * because customer names are free text supplied by the user.
 */
const RISKY_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (RISKY_PREFIX.test(s)) s = `'${s}`;
  // Quote when the value contains a delimiter, a quote, or a newline; double
  // any internal quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: (string | number | null | undefined)[]) =>
  cells.map(csvCell).join(",");

/** CRLF line endings: what Excel expects, and harmless everywhere else. */
export const csvDocument = (rows: (string | number | null | undefined)[][]) =>
  rows.map(csvRow).join("\r\n") + "\r\n";
