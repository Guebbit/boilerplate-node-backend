/**
 * @module
 * Analytics relay services — what the module publishes: the browser-event relay.
 */

import { registerBrowserEvents, relayEvent } from './relay';

/** The module's one door — the relay and the registration of the events it accepts. */
export const analyticsService = { registerBrowserEvents, relayEvent };
