// Shared block time top-up rules, used by both the server action that starts
// a top-up and the customer-facing UI that previews it.

// Minimum top-up is 10% of the package's purchased hours (not remaining).
export function blockTimeTopupMinimumHours(hoursPurchased: number): number {
  return Math.round(Number(hoursPurchased) * 10) / 100;
}

// Each top-up extends expiry by half the package's validity period, added to
// the current expiry (not from today). Rounds up on odd validity periods.
export function blockTimeTopupExtensionDays(validityDays: number): number {
  return Math.ceil(Number(validityDays) / 2);
}

export type TopupHoursValidation =
  | { ok: true; hours: number; minHours: number }
  | { ok: false; minHours: number; reason: string };

// The single authority on whether a requested top-up amount is acceptable.
export function validateBlockTimeTopupHours(
  hoursRequested: number,
  hoursPurchased: number
): TopupHoursValidation {
  const minHours = blockTimeTopupMinimumHours(hoursPurchased);
  const hours = Math.round(Number(hoursRequested) * 100) / 100;

  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, minHours, reason: "Enter a valid number of hours to top up." };
  }

  if (hours + 1e-9 < minHours) {
    return {
      ok: false,
      minHours,
      reason: `Minimum top-up is ${minHours} hours (10% of your ${Number(hoursPurchased).toFixed(0)} hour package).`,
    };
  }

  return { ok: true, hours, minHours };
}
