import type { IAuthContext } from './types/auth-context';
import type { IObservabilityContext } from './utils/observability-context';

declare module 'express-serve-static-core' {
    interface Request {
        /** Transport-safe auth context DTO (available after auth middleware). */
        authContext?: IAuthContext;
        /** Observability helpers attached by the observability middleware. */
        obs?: IObservabilityContext;
        requestId?: string;
    }
}
