/**
 * @module
 * The schema of `shared/rules/outbox.yaml`: the transactional outbox's retry policy defaults.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A positive whole number. */
const positive = z.int().positive();

/** Shape of `shared/rules/outbox.yaml`. */
export const outboxSchema = z.strictObject({
    outbox: z.strictObject({
        /** Days a published row is kept before the sweep deletes it. */
        retentionDays: positive,
        /** Failed dispatches before a row is parked as `dead`. */
        maxAttempts: positive,
        /** Seconds a relay's claim on a row lasts. */
        leaseSeconds: positive,
        /** Backoff after the first failure, in milliseconds; it doubles each time. */
        backoffBaseMs: positive,
        /** Backoff never exceeds this, in milliseconds. */
        backoffCapMs: positive
    })
});
