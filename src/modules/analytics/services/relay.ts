/**
 * @module
 * Hands a relayed browsing event to the analytics port. The consent gate is the port's own, so a
 * visitor who has not agreed is dropped there, not here.
 *
 * Which events exist, and how each becomes a provider event, is declared by the modules that own
 * them (`AppModule.browserEvents`); this file knows none of them by name.
 *
 * See: docs/modules/analytics.md
 */

import type { BrowserEventTarget } from '@kernel/registry';
import type { AnalyticsEventRequest, CallerContext } from '@types';
import { buildAnalyticsBase, emitAnalyticsEvent } from '@infrastructure/observability/analytics';

/** Every registered module's browser events, by the event name a request body carries. */
let browserEvents: Readonly<Record<string, BrowserEventTarget | undefined>> = {};

/**
 * Installs the lookup. Called once from `onRegistered`, when every enabled module is known.
 *
 * @param events - the registry's flattened browser events
 */
export const registerBrowserEvents = (
    events: Readonly<Record<string, BrowserEventTarget | undefined>>
): void => {
    browserEvents = events;
};

/**
 * Emit one relayed browsing event as the caller who sent it. An event no registered module owns is
 * dropped: the contract already refuses it, so this only meets one when the two disagree.
 *
 * @param event - the validated body, one of the contract's closed set
 * @param context - the caller, built once in the controller
 */
export const relayEvent = (event: AnalyticsEventRequest, context: CallerContext): void => {
    const target = Object.hasOwn(browserEvents, event.event)
        ? browserEvents[event.event]
        : undefined;
    if (!target) return;
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        // `never`-typed call: the target was registered for exactly this event name, so the body
        // it receives is the shape its own fragment declares.
        ...target.toReport(event as never)
    });
};
