/**
 * @module
 * The schema of `shared/rules/semantic-log-names.yaml`: the field name a structured log line is
 * written with, per field the code logs.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';

/** Shape of `shared/rules/semantic-log-names.yaml`: code field (camelCase) to the name on the line. */
export const semanticLogNamesSchema = z.strictObject({
    semanticLogNames: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.string().min(1))
});
