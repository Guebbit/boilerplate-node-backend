/**
 * @module
 * Every shared rules file with its schema, in one list. `regenerate` reads it to write
 * `shared/rules/schemas/<name>.schema.json`; the boot-time loaders read the same schemas.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import type { z } from 'zod';
import { frontendLinksSchema } from './frontend-links';
import { logRedactionSchema } from './log-redaction';
import { passwordHashSchema } from './password-hash';

/** File name (without `.yaml`) to the Zod schema its content must satisfy. */
export const SHARED_RULE_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
    'frontend-links': frontendLinksSchema,
    'log-redaction': logRedactionSchema,
    'password-hash': passwordHashSchema
};
