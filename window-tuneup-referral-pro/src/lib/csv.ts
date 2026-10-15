/** One CSV cell. Text starting with = + - @ would run as a spreadsheet formula, so it is defused. */
export function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
