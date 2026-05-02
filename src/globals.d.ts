import type { IUserDocument } from '@models/users';
import type { ITraceContext } from '@utils/observability';

/**
 * Extend the Express Request interface to carry the authenticated user.
 * For REST API: populated by JWT middleware (middlewares/authorizations.ts getAuth).
 */
declare module 'express-serve-static-core' {
    interface Request {
        user?: IUserDocument;
        requestId?: string;
        traceContext?: ITraceContext;
    }
}
