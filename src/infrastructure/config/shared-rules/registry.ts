/**
 * @module
 * Every shared rules file with its schema, in one list. `regenerate` reads it to write
 * `shared/rules/schemas/<name>.schema.json`, and the `.generated.ts` of an entry that declares
 * one; the boot-time loaders read the same schemas.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import type { z } from 'zod';
import { auditActionsSchema } from './audit-actions';
import { frontendLinksSchema } from './frontend-links';
import type { GenerateSpec } from './generate-spec';
import { logRedactionSchema } from './log-redaction';
import { passwordHashSchema } from './password-hash';

/** One rules file: its schema, and the TypeScript it generates when code needs it as types. */
export interface SharedRuleEntry {
    /** What the document must satisfy. */
    schema: z.ZodType;
    /** Present when the data types a union, so code imports a generated file, not the YAML. */
    generate?: GenerateSpec;
}

/** File name (without `.yaml`) to its entry. */
export const SHARED_RULES: Readonly<Record<string, SharedRuleEntry>> = {
    'audit-actions': {
        schema: auditActionsSchema,
        generate: {
            out: 'src/infrastructure/observability/audit-actions.generated.ts',
            exports: [
                {
                    exportName: 'coreAuditActions',
                    shape: 'keyed-list',
                    field: 'actions',
                    description:
                        'The app-level audit actions: the guards emit them for requests refused before any domain saw them.'
                }
            ]
        }
    },
    'frontend-links': { schema: frontendLinksSchema },
    'log-redaction': { schema: logRedactionSchema },
    'password-hash': { schema: passwordHashSchema }
};
