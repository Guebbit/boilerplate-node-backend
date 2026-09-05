/**
 * @module
 * The audit vocabulary this module emits — `src/modules/locales/audit.ts`. Pinned string by
 * string because an action is a WIRE CONTRACT, not just an identifier: the string is read by log
 * queries, dashboards and alert rules outside the repo that aren't refactored with it. The shape
 * is proved by `tests/cross-cutting/audit-actions.test.ts`; the values are asserted here, by their
 * owner.
 */

import { localeAuditActions } from '../../audit';

describe('the locales audit vocabulary', () => {
    it('spells every action exactly as the log tooling expects', () => {
        expect(localeAuditActions).toEqual({
            ADMIN_LOCALE_CREATED: 'admin.locale.created',
            ADMIN_LOCALE_UPDATED: 'admin.locale.updated',
            ADMIN_LOCALE_DELETED: 'admin.locale.deleted',
            ADMIN_LOCALE_ENTRY_CREATED: 'admin.locale_entry.created',
            ADMIN_LOCALE_ENTRY_UPDATED: 'admin.locale_entry.updated',
            ADMIN_LOCALE_ENTRY_DELETED: 'admin.locale_entry.deleted',
            ADMIN_LOCALE_ENTRY_IMPORTED: 'admin.locale_entry.imported'
        });
    });

    /*
     * Not cosmetic. The cross-cutting sweep requires `noun.noun.verb` in lower snake_case, so
     * `locale-entry` — which is how the noun reads everywhere else in this module — would fail it.
     * Asserted here too, at the point where someone renaming the noun would be looking.
     */
    it('spells its two-word noun with an underscore, as the sweep requires', () => {
        for (const action of Object.values(localeAuditActions)) expect(action).not.toContain('-');
    });
});
