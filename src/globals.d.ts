import type { IUserDocument } from '@models/users';
import type { IAuthContext } from './types/auth-context';
import type { IRequestDeps } from './types/request-deps';

declare module 'express-serve-static-core' {
    interface Request {
        /**
         * @deprecated Prefer authContext — kept only for middleware-level auth checks.
         * Will be removed once middleware is fully migrated.
         */
        user?: IUserDocument;
        /** Transport-safe auth context DTO. Controllers must use this for identity data. */
        authContext?: IAuthContext;
        /** Injectable cross-cutting concerns — prefer over direct utility imports in controllers. */
        deps: IRequestDeps;
        requestId?: string;
    }
}
