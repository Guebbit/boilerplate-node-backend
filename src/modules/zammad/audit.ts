/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. One today: the restoration log of a replay, which ISO/IEC 27701 asks for whenever erasures
 * are applied again after a restore.
 *
 * @see docs/operate/zammad.md#restore
 */

/** The audit action strings this module fires, keyed by event. */
export const zammadAuditActions = {
    /**
     * `zammad:replay-erasures` set the erase jobs completed since a Zammad dump back to pending, so
     * the worker files the deletion tasks again. `metadata` holds who restored, the dump's time and
     * how many jobs were reopened.
     */
    ZAMMAD_ERASURES_REPLAYED: 'zammad.erasures.replayed'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        zammad: (typeof zammadAuditActions)[keyof typeof zammadAuditActions];
    }
}
