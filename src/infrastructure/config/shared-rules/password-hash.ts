/**
 * @module
 * The schema of `shared/rules/password-hash.yaml`: the argon2id cost every new hash is made with.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A positive whole number. */
const positive = z.int().positive();

/** Shape of `shared/rules/password-hash.yaml`. */
export const passwordHashSchema = z.strictObject({
    /** Memory cost in KiB (`m`). */
    memoryKib: positive,
    /** Passes over that memory (`t`). */
    passes: positive,
    /** Lanes (`p`). */
    parallelism: positive
});

/** Parsed `password-hash.yaml`. */
export type PasswordHashRules = z.infer<typeof passwordHashSchema>;
