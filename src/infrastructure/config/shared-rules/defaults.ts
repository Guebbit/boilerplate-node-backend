/**
 * @module
 * The schema of `shared/rules/defaults.yaml`: the plain-number defaults both backends start from.
 * Each is overridden by an environment variable; the twin reads the same numbers.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A positive whole number. */
const positive = z.int().positive();

/** Shape of `shared/rules/defaults.yaml`. */
export const defaultsSchema = z.strictObject({
    defaults: z.strictObject({
        /** The response cache's bounds. */
        responseCache: z.strictObject({
            /** Longest TTL, in seconds, a development run may ask for. */
            devTtlMaxSeconds: z.int().min(0),
            /** Largest body, in bytes, the cache stores. */
            maxBytes: positive
        }),
        /** The idempotency ledger. */
        idempotency: z.strictObject({
            /** Hours a stored response is replayable. */
            retentionHours: positive
        }),
        /** Paging. */
        pagination: z.strictObject({
            /** Rows per page when the caller names no limit. */
            pageSize: positive
        }),
        /** Image processing limits. */
        images: z.strictObject({
            /** Most pixels a decoder is allowed to open. */
            maxInputPixels: positive,
            /** Longest side, in pixels, a stored original may have. */
            maxDimension: positive,
            /** Longest side, in pixels, of a thumbnail. */
            thumbnailDimension: positive,
            /** Hours a quarantined upload is left alone before it counts as abandoned. */
            quarantineRetentionHours: positive
        }),
        /** Uploads. */
        uploads: z.strictObject({
            /** Largest accepted upload body, in bytes. */
            maxBytes: positive
        })
    })
});
