import type { IUserDocument } from '@models/users';
import type { IAuthContext } from './types/auth-context';

declare module 'express-serve-static-core' {
    interface Request {
        /** Full Mongoose document (available after auth middleware). */
        user?: IUserDocument;
        /** Transport-safe auth context DTO (DIP: prefer this over user document in controllers). */
        authContext?: IAuthContext;
        requestId?: string;
    }
}
