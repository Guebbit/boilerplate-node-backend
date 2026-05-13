import type { IUserDocument } from '@models/users';

declare module 'express-serve-static-core' {
    interface Request {
        user?: IUserDocument;
        requestId?: string;
    }
}
