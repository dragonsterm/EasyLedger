import type { LedgerCurrency } from './analytics.ts';

export function parseMoneyInput(input: string, currency: LedgerCurrency): string {
  const value = input.trim();
  if (currency === 'IDR') {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('IDR prices must be whole rupiah amounts.');
    return BigInt(value).toString();
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('USD prices can have up to two decimal places.');
  const cents = (match[2] ?? '').padEnd(2, '0');
  return (BigInt(match[1]) * 100n + BigInt(cents || '0')).toString();
}

export function formatMoneyInput(minorUnits: string, currency: LedgerCurrency): string {
  if (!/^(0|[1-9]\d*)$/.test(minorUnits)) throw new Error('Money value must be a non-negative integer.');
  if (currency === 'IDR') return minorUnits;
  const amount = BigInt(minorUnits);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}

export function formatLedgerAmount(value: number | string | bigint, currency: LedgerCurrency = 'IDR'): string {
  const minorUnits = BigInt(value);
  if (currency === 'IDR') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(minorUnits);
  }
  const whole = minorUnits / 100n;
  const cents = (minorUnits % 100n).toString().padStart(2, '0');
  const formattedWhole = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);
  return `${formattedWhole}.${cents}`;
}
