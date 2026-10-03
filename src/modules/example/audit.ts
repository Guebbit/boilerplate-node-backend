/**
 * @module
 * In any module: the audit actions it emits, declared by augmentation so the app-wide union grows
 * with the modules that are enabled — see `modules/account/audit.ts` for why.
 *
 * See: docs/tools/winston.md
 */

/** The audit action vocabulary this module owns. */
export const exampleAuditActions = {
    EXAMPLE_CREATED: 'example.created',
    EXAMPLE_UPDATED: 'example.updated',
    EXAMPLE_DELETED: 'example.deleted',
    EXAMPLE_COVER_CHANGED: 'example.cover_changed'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        example: (typeof exampleAuditActions)[keyof typeof exampleAuditActions];
    }
}
