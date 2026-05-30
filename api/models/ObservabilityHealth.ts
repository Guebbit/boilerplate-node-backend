/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ObservabilityHealthIntegrations } from './ObservabilityHealthIntegrations';
import type { ObservabilityHealthMemory } from './ObservabilityHealthMemory';
import type { ObservabilityHealthSystem } from './ObservabilityHealthSystem';
export type ObservabilityHealth = {
    status: ObservabilityHealth.status;
    environment: string;
    service: string;
    nodeVersion: string;
    uptimeSeconds: number;
    database: {
        status: ObservabilityHealth.status;
    };
    integrations?: ObservabilityHealthIntegrations;
    memory?: ObservabilityHealthMemory;
    system?: ObservabilityHealthSystem;
    timestamp: string;
};
export namespace ObservabilityHealth {
    export enum status {
        OK = 'ok',
        DEGRADED = 'degraded',
    }
}

