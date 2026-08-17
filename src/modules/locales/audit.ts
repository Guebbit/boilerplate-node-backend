/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * Every one of these is a write that changes WHAT USERS READ. A translation edited on a Friday
 * afternoon is indistinguishable from a copy change nobody approved unless something recorded who
 * made it, and these rows are the only record: the dictionary itself keeps no history, and the
 * git log that used to answer this question stopped applying the moment the copy left the
 * repository.
 *
 * The reads are deliberately NOT audited, in either tier. `GET /locales/{locale}/messages` is
 * public and anonymous, and `GET /locales/{locale}/entries` returns text written to be published
 * — contrast `feedback`, which audits its reads because its rows carry an email address and free
 * text from the public.
 *
 * Segments are snake_case, not hyphenated: `tests/cross-cutting/audit-actions.test.ts` requires
 * `noun.noun.verb` in lower snake_case, so `locale_entry` is the spelling and `locale-entry` would
 * fail the sweep.
 */

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

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        locales: (typeof localeAuditActions)[keyof typeof localeAuditActions];
    }
}
