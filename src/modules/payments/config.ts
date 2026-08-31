/**
 * @module
 * The one value a deployment tunes about money, read in one place — same arrangement as
 * `@modules/inventory`'s `config.ts`: read per call so a change takes effect on the next intent,
 * not the next restart, and so a second reader doesn't transcribe its own copy of the fallback.
 */

/**
 * The currency every payment is denominated in — ISO-4217, one per deployment. Stamped onto each
 * payment at intent time, so a later config change never relabels money already taken.
 *
 * @returns the ISO-4217 code to stamp on new payments; `EUR` if unset
 */
export const defaultCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';
