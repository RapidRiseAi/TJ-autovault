export function parseAmountInputToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s+/g, '').replace(/,/g, '.');
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;

  const [wholePart, decimalPart = ''] = normalized.split('.');
  const centsPart = (decimalPart + '00').slice(0, 2);
  const cents = BigInt(wholePart) * 100n + BigInt(centsPart || '0');

  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(cents);
}
