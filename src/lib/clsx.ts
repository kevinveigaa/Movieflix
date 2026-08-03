type ClassValue = string | number | null | false | undefined | ClassValue[] | { [key: string]: boolean | null | undefined };

export function clsx(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const inner = clsx(...input);
      if (inner) out.push(inner);
    } else if (typeof input === 'object') {
      for (const [key, val] of Object.entries(input)) {
        if (val) out.push(key);
      }
    }
  }
  return out.join(' ');
}
