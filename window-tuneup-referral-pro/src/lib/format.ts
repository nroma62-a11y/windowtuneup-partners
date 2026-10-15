/** Formats as the user types: (780) 555-0123. Accepts pasted numbers like +1 780-555-0123. */
export function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('1')) d = d.slice(1); // Canadian/US area codes never start with 1
  d = d.slice(0, 10);
  if (!d) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const isCompletePhone = (value: string) => value.replace(/\D/g, '').length === 10;
