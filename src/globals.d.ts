import type { IUserDocument } from '@models/users';
import type { IAuthContext } from './types/auth-context';

declare module 'express-serve-static-core' {
    interface Request {
        /**
         * @deprecated Prefer authContext — kept only for middleware-level auth checks.
         * Will be removed once middleware is fully migrated.
         */
        user?: IUserDocument;
        /** Transport-safe auth context DTO. Controllers must use this for identity data. */
        authContext?: IAuthContext;
        requestId?: string;
    }
}
