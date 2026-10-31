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
import { cookiesSchema } from './cookies';
import { defaultsSchema } from './defaults';
import { frontendLinksSchema } from './frontend-links';
import type { GenerateSpec } from './generate-spec';
import { imagesSchema } from './images';
import { jobsSchema } from './jobs';
import { logRedactionSchema } from './log-redaction';
import { metricsSchema } from './metrics';
import { outboxSchema } from './outbox';
import { passwordHashSchema } from './password-hash';
import { rateLimitsSchema } from './rate-limits';
import { semanticLogNamesSchema } from './semantic-log-names';

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
    cookies: {
        schema: cookiesSchema,
        generate: {
            out: 'src/infrastructure/http/cookies.generated.ts',
            exports: [
                {
                    exportName: 'cookieData',
                    shape: 'verbatim',
                    field: 'cookies',
                    description:
                        'Every cookie the backend sets, by id: name, purpose, necessity, secret and lifetime.'
                }
            ]
        }
    },
    defaults: {
        schema: defaultsSchema,
        generate: {
            out: 'src/infrastructure/config/defaults.generated.ts',
            exports: [
                {
                    exportName: 'sharedDefaults',
                    shape: 'verbatim',
                    field: 'defaults',
                    description:
                        'The defaults both backends start from; each has an environment variable that overrides it.'
                }
            ]
        }
    },
    'frontend-links': { schema: frontendLinksSchema },
    images: {
        schema: imagesSchema,
        generate: {
            out: 'src/infrastructure/adapters/images.generated.ts',
            exports: [
                {
                    exportName: 'imageRuleData',
                    shape: 'verbatim',
                    field: 'images',
                    description:
                        'The accepted image formats and their signatures, and the thumbnail version.'
                }
            ]
        }
    },
    jobs: {
        schema: jobsSchema,
        generate: {
            out: 'src/app/jobs.generated.ts',
            exports: [
                {
                    exportName: 'appJobData',
                    shape: 'verbatim',
                    field: 'jobs',
                    description: 'The kernel jobs as data; `jobs.ts` adds what each one runs.'
                }
            ]
        }
    },
    'log-redaction': { schema: logRedactionSchema },
    metrics: {
        schema: metricsSchema,
        generate: {
            out: 'src/infrastructure/observability/metrics.generated.ts',
            exports: [
                {
                    exportName: 'infrastructureMetricData',
                    shape: 'verbatim',
                    field: 'metrics',
                    description:
                        'Name, kind, help, labels and buckets of every infrastructure metric.'
                }
            ]
        }
    },
    outbox: {
        schema: outboxSchema,
        generate: {
            out: 'src/kernel/outbox.generated.ts',
            exports: [
                {
                    exportName: 'outboxRuleData',
                    shape: 'verbatim',
                    field: 'outbox',
                    description:
                        'The outbox retry policy defaults; the environment overrides the first three.'
                }
            ]
        }
    },
    'password-hash': { schema: passwordHashSchema },
    'rate-limits': {
        schema: rateLimitsSchema,
        generate: {
            out: 'src/infrastructure/http/middlewares/rate-limits.generated.ts',
            exports: [
                {
                    exportName: 'infrastructureRateLimitData',
                    shape: 'verbatim',
                    field: 'rateLimits',
                    description:
                        'The kernel budgets (browsing, api-key, upload) as data; `rate-limit.ts` adds their key and skip logic.'
                }
            ]
        }
    },
    'semantic-log-names': {
        schema: semanticLogNamesSchema,
        generate: {
            out: 'src/infrastructure/adapters/semantic-log-names.generated.ts',
            exports: [
                {
                    exportName: 'semanticLogNameData',
                    shape: 'verbatim',
                    field: 'semanticLogNames',
                    description: 'Field name in code to the name a log line is written with.'
                }
            ]
        }
    }
};
