/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why, rather than a shared enum. A role grant or revocation is the one action in this module that
 * changes what somebody may do, which is exactly the class of event a compliance query needs to
 * find by prefix (`access.*`) — everything else here (`membershipsOf`, `rolesOf`, …) only reads.
 */

/** The audit action vocabulary this module owns. */
export const accessAuditActions = {
    /** A membership was given a role — by an admin (`users.any.update`/`users.any.create`), never self-service. */
    ROLE_ASSIGNED: 'access.role.assigned',
    /** A membership's role was taken away. */
    ROLE_REVOKED: 'access.role.revoked'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        access: (typeof accessAuditActions)[keyof typeof accessAuditActions];
    }
}
