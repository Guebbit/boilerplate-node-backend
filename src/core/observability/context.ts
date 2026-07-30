/**
 * Dependency-injection seam for observability.
 *
 * The problem this solves: a controller that calls `emitAuditEvent` directly is impossible to
 * unit-test without either hitting the real logger/PostHog or resorting to module mocking.
 * Passing the emitters in on the request makes them substitutable with plain spies.
 */

import { emitAuditEvent, type IAuditEvent } from '@core/observability/audit';
import { emitAnalyticsEvent, type IAnalyticsEvent } from '@core/observability/analytics';

/**
 * Observability context bundled per-request.
 * Controllers consume this instead of importing singletons directly,
 * making them easier to test via injection.
 *
 * Both members return `void`: emitting is fire-and-forget by design, so a controller can never
 * accidentally await — or fail on — telemetry.
 */
export interface IObservabilityContext {
    /** Security/compliance trail — see `observability/audit`. */
    audit: (event: IAuditEvent) => void;
    /** Product analytics — see `observability/analytics`. */
    analytics: (event: IAnalyticsEvent) => void;
}

/**
 * Default implementation that delegates to the real singletons.
 * Attach to request via the observability middleware.
 *
 * Just function references, not wrappers — there is no indirection cost, and a test swaps the
 * whole object for `{ audit: jest.fn(), analytics: jest.fn() }`.
 */
export const defaultObservabilityContext: IObservabilityContext = {
    audit: emitAuditEvent,
    analytics: emitAnalyticsEvent
};
