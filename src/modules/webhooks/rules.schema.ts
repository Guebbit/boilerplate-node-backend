/**
 * @module
 * The schema of `rules.yaml` and what `npm run regenerate` writes from it.
 * In any module: numbers and lists the PHP twin copies, as data.
 * Here: the retry ladder and the auto-disable thresholds.
 *
 * See: docs/theory/shared-rules.md
 */

import { z } from 'zod';
import type { GenerateSpec } from '../../infrastructure/config/shared-rules/generate-spec';

/** A positive whole number. */
const count = z.int().positive();

/** Shape of `rules.yaml`. */
export const rulesSchema = z.strictObject({
    retry: z.strictObject({
        /** Wait after each failed attempt, in milliseconds; the last entry ends the ladder. */
        delaysMs: z.array(count).min(1)
    }),
    autoDisable: z.strictObject({
        /** Exhausted chains in a row before a subscription auto-disables. */
        maxConsecutiveFailures: count,
        /** How long the streak must have run, in milliseconds. */
        minFailingMs: count
    })
});

/** What `rules.yaml` generates: `rules.generated.ts`. */
export const rulesGenerate: GenerateSpec = {
    out: 'src/modules/webhooks/domain/rules.generated.ts',
    exports: [
        {
            exportName: 'retryRules',
            shape: 'verbatim',
            field: 'retry',
            description: 'The retry ladder.'
        },
        {
            exportName: 'autoDisableRules',
            shape: 'verbatim',
            field: 'autoDisable',
            description: 'When a failing subscription is switched off.'
        }
    ]
};
