/**
 * @module
 * Audit actions this module emits (see `modules/account/audit.ts` for why they are declared by
 * augmentation, not a shared enum). Each is a write that changes what users read — these rows are
 * the only history, since reads are deliberately not audited. Segments are snake_case:
 * `tests/cross-cutting/audit-actions.test.ts` requires `noun.noun.verb`.
 */

/** Every audit action this module emits, keyed by the constant name call sites use. */
export const localeAuditActions = {
    ADMIN_LOCALE_CREATED: 'admin.locale.created',
    ADMIN_LOCALE_UPDATED: 'admin.locale.updated',
    ADMIN_LOCALE_DELETED: 'admin.locale.deleted',
    ADMIN_LOCALE_ENTRY_CREATED: 'admin.locale_entry.created',
    ADMIN_LOCALE_ENTRY_UPDATED: 'admin.locale_entry.updated',
    ADMIN_LOCALE_ENTRY_DELETED: 'admin.locale_entry.deleted',
    /*
     * One action for both bulk routes, with the mode in the metadata. They differ in what they do
     * to keys the body did not name, which is a detail of the same event — and a compliance query
     * asking "who changed the Spanish copy" wants one prefix to filter on, not two.
     */
    ADMIN_LOCALE_ENTRY_IMPORTED: 'admin.locale_entry.imported'
} as const;

/** Merges this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        locales: (typeof localeAuditActions)[keyof typeof localeAuditActions];
    }
}
