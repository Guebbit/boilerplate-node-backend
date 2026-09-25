/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. `auth.` rather than `addresses.`: entries in the caller's own address book are self-service
 * PII edits under `/account/addresses`, the same vocabulary `account`'s own profile edits use, and
 * a log reader filtering `auth.*` should see every self-service change to a caller's own record in
 * one place.
 */

/** The audit action vocabulary this module owns. */
export const addressesAuditActions = {
    /** A PUT (replace) or PATCH (merge) against one entry — the factory audits it generically,
     *  never learning which verb produced the change (see `create-update-controller.ts`). */
    AUTH_ADDRESS_BOOK_ENTRY_UPDATED: 'auth.address_book_entry.updated'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        addresses: (typeof addressesAuditActions)[keyof typeof addressesAuditActions];
    }
}
