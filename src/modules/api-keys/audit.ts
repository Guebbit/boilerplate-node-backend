/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. A credential's mint and revoke are exactly the kind of write a data-protection or an
 * incident question gets asked about later, so both are audited.
 */

/** The audit action vocabulary this module owns. */
export const apiKeysAuditActions = {
    ADMIN_API_KEY_MINTED: 'admin.api_key.minted',
    ADMIN_API_KEY_REVOKED: 'admin.api_key.revoked',
    /** Every credential a person minted was revoked because their account may be compromised. */
    SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE: 'system.api_keys.revoked_on_compromise'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        apiKeys: (typeof apiKeysAuditActions)[keyof typeof apiKeysAuditActions];
    }
}
