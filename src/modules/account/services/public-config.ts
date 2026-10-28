/**
 * @module
 * The account module's part of `GET /config`: how this deployment keeps people signed in, and which
 * OAuth providers it holds credentials for. Public and constant for the life of the process.
 */

import type { SessionConfig } from '@types';
import {
    getExpiryTime,
    getSessionMode,
    getStaffLifetimeSeconds,
    RefreshTokenExpiryTime
} from '../session/config';
import { enabledProviders } from '../oauth/providers';

/**
 * How this deployment keeps people signed in and for how long, so a client adapts at boot instead
 * of carrying a switch of its own.
 */
export const sessionConfig = (): SessionConfig => {
    const staffLifetimeSeconds = getStaffLifetimeSeconds();
    return {
        mode: getSessionMode(),
        lifetimeSeconds: {
            short: getExpiryTime(RefreshTokenExpiryTime.SHORT),
            medium: getExpiryTime(RefreshTokenExpiryTime.MEDIUM),
            long: getExpiryTime(RefreshTokenExpiryTime.LONG)
        },
        // 0 switches the cap off: nothing to state.
        ...(staffLifetimeSeconds > 0 && { staffLifetimeSeconds })
    };
};

/** The OAuth providers this deployment has credentials for; empty when none are configured. */
export const oauthProviders = (): string[] => enabledProviders();
