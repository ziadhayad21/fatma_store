/**
 * One quoted CSV cell. A value a spreadsheet would read as a formula
 * (starting with =, +, -, @, and also tab / carriage return) gets a leading ' so it stays plain text.
 */
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
