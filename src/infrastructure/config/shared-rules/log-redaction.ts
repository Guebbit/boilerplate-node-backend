/**
 * @module
 * The schema of `shared/rules/log-redaction.yaml`: which log keys are credentials, which are
 * personal data, and which URL query parameters a trace span may not carry.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** A non-empty list of non-empty strings. */
const names = z.array(z.string().min(1)).min(1);

/** Shape of `shared/rules/log-redaction.yaml`. */
export const logRedactionSchema = z.strictObject({
    /** Exact key names (after normalisation) whose values are replaced, never logged. */
    sensitiveFields: names,
    /** Fragments that make a key sensitive wherever they appear in it. */
    sensitiveKeyFragments: names,
    /** Personal-data keys: hashed by default rather than dropped. */
    personalFields: names,
    /** Query parameters a span's URL attributes may not carry in clear. */
    traceUrlSecrets: names
});

/** Parsed `log-redaction.yaml`. */
export type LogRedactionRules = z.infer<typeof logRedactionSchema>;
