/**
 * @module
 * In any module: the schema of `rules.yaml` (the audit and analytics names, as data the PHP twin
 * copies) and what `npm run regenerate` writes from it.
 * Here: the example's two lists.
 *
 * See: docs/theory/shared-rules.md
 */

import { z } from 'zod';
import {
    keyedListSchema,
    type GenerateSpec
} from '../../infrastructure/config/shared-rules/generate-spec';

/** Shape of `rules.yaml`. */
export const rulesSchema = z.strictObject({
    /** Dotted `noun.verb` strings, unique across modules (`tests/cross-cutting/audit-actions.test.ts`). */
    audit: keyedListSchema(/^[a-z_]+(\.[a-z_]+)+$/),
    /** Snake-case event names (`docs/tools/analytics.md#naming`). */
    analytics: keyedListSchema(/^[a-z]+(_[a-z]+)+$/)
});

/** What `rules.yaml` generates: `rules.generated.ts`. */
export const rulesGenerate: GenerateSpec = {
    out: 'src/modules/example/rules.generated.ts',
    exports: [
        {
            exportName: 'exampleAuditActions',
            shape: 'keyed-list',
            field: 'audit',
            description: 'The audit action vocabulary this module owns.'
        },
        {
            exportName: 'exampleAnalyticsEvents',
            shape: 'keyed-list',
            field: 'analytics',
            description: 'The event names this module fires, keyed by intent.'
        }
    ]
};
