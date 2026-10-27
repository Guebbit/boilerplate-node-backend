/**
 * @module
 * In any module: the audit actions it emits, declared by augmentation so the app-wide union grows
 * with the modules that are enabled — see `modules/account/audit.ts` for why.
 * Here: create, update, status change, delete and cover change of an example, listed in `rules.yaml`.
 *
 * See: docs/tools/winston.md
 */

import { exampleAuditActions } from './rules.generated';

/** The audit action vocabulary this module owns, generated from `rules.yaml`. */
export { exampleAuditActions } from './rules.generated';

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        example: (typeof exampleAuditActions)[keyof typeof exampleAuditActions];
    }
}
