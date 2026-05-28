import { emitAuditEvent, type IAuditEvent } from './audit';
import { emitAnalyticsEvent, type IAnalyticsEvent } from './analytics';

/**
 * Observability context bundled per-request.
 * Controllers consume this instead of importing singletons directly,
 * making them easier to test via injection.
 */
export interface IObservabilityContext {
    audit: (event: IAuditEvent) => void;
    analytics: (event: IAnalyticsEvent) => void;
}

/**
 * Default implementation that delegates to the real singletons.
 * Attach to request via the observability middleware.
 */
export const defaultObservabilityContext: IObservabilityContext = {
    audit: emitAuditEvent,
    analytics: emitAnalyticsEvent
};
