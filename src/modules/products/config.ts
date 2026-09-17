/**
 * @module
 * The two VAT rates a deployment charges, read per call rather than captured at import — the
 * pattern `inventory/config.ts` sets, so a rate change takes effect on the next resolve instead
 * of the next restart.
 *
 * Owned by `products` because `resolveTaxRate` (`./tax`) is the only reader: a product's tax
 * class resolving to a rate is an invariant of the catalogue. `orders` freezes whatever that
 * returns onto a line; it never reads a rate itself.
 */

import { environmentDecimal, parseEnvironmentDecimal } from '@infrastructure/runtime/environment';

/**
 * The VAT rate applied to a product with no `taxClass` — the shop's default, and every product's
 * fallback. Required at boot ({@link invalidVatRateConfig} range-checks it); the fallback here is
 * for `NODE_ENV=test` and the demo profile, which both skip that gate.
 * @returns the configured decimal rate (0.22 for 22%), or `0.22` when unset
 */
export const vatRateDefault = (): number => environmentDecimal('NODE_VAT_RATE_DEFAULT', 0.22);

/**
 * The VAT rate applied to a product whose `taxClass` is `reduced` — books, food, medicine and
 * similar, depending on the deployment's own jurisdiction.
 * @returns the configured decimal rate (0.1 for 10%), or `0.1` when unset
 */
export const vatRateReduced = (): number => environmentDecimal('NODE_VAT_RATE_REDUCED', 0.1);

/**
 * A decimal rate is valid VAT config only inside `[0, 1)` — 1 (100%) or more is certainly a typo.
 * Parsed through {@link parseEnvironmentDecimal}, the same parser {@link vatRateDefault} and
 * {@link vatRateReduced} read the variable through — a looser check here (a bare `Number(raw)`
 * accepts `.5`, `1e-1`, and a whitespace-only string, none of which the reader treats as set)
 * would pass a value that then silently resolves to the fallback rate instead.
 */
const isValidVatRate = (raw: string): boolean => {
    const parsed = parseEnvironmentDecimal(raw);
    return parsed !== undefined && parsed >= 0 && parsed < 1;
};

/**
 * This module's `customCheck`. The manifest's `requiredConfig` only catches an EMPTY
 * `NODE_VAT_RATE_DEFAULT`/`_REDUCED`; this catches one set to something that isn't a rate at all,
 * `2.2` or `abc`, which would otherwise reach {@link vatRateDefault} and silently misprice every
 * invoice. Only flags a variable that IS set — an absent one is already named by the declarative
 * check, and naming it twice would just be confusing.
 * @returns the offending variable names; empty when both are unset or parse as a rate in `[0, 1)`
 */
export const invalidVatRateConfig = (): string[] =>
    ['NODE_VAT_RATE_DEFAULT', 'NODE_VAT_RATE_REDUCED'].filter((key) => {
        const raw = process.env[key];
        return !!raw && !isValidVatRate(raw);
    });
