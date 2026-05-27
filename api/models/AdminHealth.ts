/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminHealthIntegrations } from './AdminHealthIntegrations';
import type { AdminHealthMemory } from './AdminHealthMemory';
import type { AdminHealthSystem } from './AdminHealthSystem';
export type AdminHealth = {
    status: AdminHealth.status;
    environment: string;
    service: string;
    nodeVersion: string;
    uptimeSeconds: number;
    database: {
        status: AdminHealth.databaseStatus;
    };
    integrations?: AdminHealthIntegrations;
    memory?: AdminHealthMemory;
    system?: AdminHealthSystem;
    timestamp: string;
};
export namespace AdminHealth {
    export enum status {
        OK = 'ok',
        DEGRADED = 'degraded',
    }
    export enum databaseStatus {
        CONNECTED = 'connected',
        CONNECTING = 'connecting',
        DISCONNECTED = 'disconnected',
    }
}
