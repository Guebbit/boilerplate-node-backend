/**
 * @module
 * The schema of `shared/rules/cookies.yaml`: every cookie (or, in the frontend's own file, browser
 * storage item) an app sets, one format for both files.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** One cookie or storage item. Strict: an extra key is a typo, or a behaviour that belongs in code. */
export const cookieRowSchema = z.strictObject({
    /** The wire name, exactly as the browser stores it. */
    name: z.string().min(1),
    /** Who sets it: this backend, the frontend, or a library the frontend loads. */
    setter: z.enum(['backend', 'frontend', 'library']),
    /** Where it lives in the browser. */
    kind: z.enum(['cookie', 'localStorage', 'sessionStorage']),
    /** What it holds and why, in one plain sentence; the GDPR table prints it. */
    purpose: z.string().min(1),
    /** Why it needs no consent: `necessary` is the ePrivacy Art. 5(3) exemption. */
    necessity: z.enum(['necessary', 'preference']),
    /** A credential: the log scrubber never writes its value. */
    secret: z.boolean(),
    /** Lifetime in ms, only where code reads it from here. */
    maxAgeMs: z.int().positive().optional(),
    /** Lifetime in words, where it is not a constant: the session tier, or its challenge's expiry. */
    lifetime: z.enum(['sessionTier', 'challenge']).optional()
});

/** One parsed row. */
export type CookieRow = z.infer<typeof cookieRowSchema>;

/** A row's id: camelCase, because the frontend uses it as a translation key. */
const rowId = z.string().regex(/^[a-z][A-Za-z0-9]*$/);

/** Shape of `shared/rules/cookies.yaml`. */
export const cookiesSchema = z.strictObject({
    /** Rows by id. */
    cookies: z
        .record(rowId, cookieRowSchema)
        .refine((rows) => Object.keys(rows).length > 0, { message: 'the inventory is empty' })
        .refine(
            (rows) =>
                Object.values(rows).every(
                    (row) => row.maxAgeMs === undefined || row.lifetime === undefined
                ),
            { message: 'a row has both maxAgeMs and lifetime' }
        )
        .refine(
            (rows) => {
                const names = Object.values(rows).map((row) => row.name);
                return new Set(names).size === names.length;
            },
            { message: 'a name is listed twice' }
        )
});

/** Parsed `cookies.yaml`. */
export type CookieRules = z.infer<typeof cookiesSchema>;
