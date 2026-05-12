/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type AuditEventItem = {
    actor_user_id: string;
    actor_role: AuditEventItem.actor_role;
    /**
     * Dot-notation action name (e.g. auth.login.succeeded)
     */
    action: string;
    outcome: AuditEventItem.outcome;
    ip?: string;
    user_agent?: string;
    request_id?: string;
    trace_id?: string;
    target_type?: string;
    target_id?: string;
    metadata?: Record<string, any>;
    timestamp: string;
    level: AuditEventItem.level;
};
export namespace AuditEventItem {
    export enum actor_role {
        ADMIN = 'admin',
        USER = 'user',
        ANONYMOUS = 'anonymous',
    }
    export enum outcome {
        SUCCESS = 'success',
        FAILURE = 'failure',
    }
    export enum level {
        INFO = 'info',
        WARN = 'warn',
    }
}

