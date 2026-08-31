/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * Every one of these is a write that changes what users read, and these rows are the only record —
 * the dictionary itself keeps no history. Reads are deliberately not audited: the messages endpoint
 * is public, anonymous text written to be published.
 *
 * Segments are snake_case, not hyphenated: `tests/cross-cutting/audit-actions.test.ts` requires
 * `noun.noun.verb` in lower snake_case.
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
