/**
 * @module
 * The schema of `shared/rules/audit-actions.yaml`: the audit actions that belong to no module.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 */

import { z } from 'zod';
import { keyedListSchema } from './generate-spec';

/** Shape of `shared/rules/audit-actions.yaml`. */
export const auditActionsSchema = z.strictObject({
    /** Dotted `security.*` strings; the prefix is what reaches the platform operator's alerts. */
    actions: keyedListSchema(/^security(\.[a-z_]+)+$/)
});
