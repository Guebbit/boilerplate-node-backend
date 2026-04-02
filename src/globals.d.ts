import type { IUserDocument } from '@models/users';

declare module 'express' {
    interface Request {
        user?: IUserDocument;
    }
}
