/**
 * @module
 * The schema of `rules.yaml` and what `npm run regenerate` writes from it.
 * In any module: numbers and lists the PHP twin copies, as data.
 * Here: the two-factor lockout and the delivered-code limits.
 *
 * See: docs/theory/shared-rules.md
 */

import { z } from 'zod';
import type { GenerateSpec } from '../../infrastructure/config/shared-rules/generate-spec';

/** A positive whole number. */
const count = z.int().positive();

/** Shape of `rules.yaml`. */
export const rulesSchema = z.strictObject({
    twoFactor: z.strictObject({
        lockout: z.strictObject({
            /** Wrong codes before the account locks. */
            maxFailures: count,
            /** How long the lock lasts, in milliseconds. */
            lockMs: count
        }),
        deliveredCodes: z.strictObject({
            /** Digits in a delivered code. */
            digits: count,
            /** How long a delivered code is accepted, in milliseconds. */
            ttlMs: count,
            /** Seconds between two deliveries of the same method. */
            resendSeconds: count,
            /** Wrong guesses one code tolerates before it is burned. */
            maxAttempts: count
        })
    })
});

/** What `rules.yaml` generates: `rules.generated.ts`. */
export const rulesGenerate: GenerateSpec = {
    out: 'src/modules/account/rules.generated.ts',
    exports: [
        {
            exportName: 'twoFactorRules',
            shape: 'verbatim',
            field: 'twoFactor',
            description: 'The two-factor lockout and delivered-code limits.'
        }
    ]
};
