import type { IAuditEvent } from '@utils/audit';
import type { IAnalyticsEvent } from '@utils/analytics';

/**
 * Request-scoped dependencies interface.
 * Decouples controllers from concrete singletons (audit, analytics, logging),
 * making them trivially testable without Jest module mocking.
 *
 * Usage in controllers: request.deps.emitAudit({ ... })
 * Usage in tests: override request.deps with stubs.
 */
export interface IRequestDeps {
    emitAudit: (event: IAuditEvent) => void;
    emitAnalytics: (event: IAnalyticsEvent) => void;
    log: {
        info: (message: string, meta?: Record<string, unknown>) => void;
        warn: (message: string, meta?: Record<string, unknown>) => void;
        error: (message: string, meta?: Record<string, unknown>) => void;
    };
}
