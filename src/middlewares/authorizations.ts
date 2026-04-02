import type { Request, Response, NextFunction } from 'express';
import { userModel as Users, IToken } from '@models/users';
import { verifyAccessToken } from './auth-jwt';
import { rejectResponse } from '@utils/response';

export const getTokenBearer = (request: Request) =>
    request.header('Authorization')?.split(' ')[1] as IToken['token'] | undefined;

export const getAuth = (request: Request, _response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!token) {
        next();
        return;
    }

    verifyAccessToken(token)
        .then(({ id }) => Users.findByPk(Number(id)))
        .then((user) => {
            if (user) request.user = user as unknown as Request['user'];
        })
        .catch(() => {
            // Invalid or expired token — proceed without authenticated user
        })
        .finally(next);
};

export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!request.user || !token) {
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    next();
};

export const isAdmin = (request: Request, response: Response, next: NextFunction) => {
    if (!request.user) {
        rejectResponse(response, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.user.admin) {
        rejectResponse(response, 403, "Forbidden: You don't have permission.");
        return;
    }
    next();
};

export const isGuest = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);
    if (token) {
        rejectResponse(response, 400, 'You are already logged in.');
        return;
    }
    next();
};

export const isUser = (request: Request, _response: Response, next: NextFunction) => {
    if (request.user?.id) request.params.id = String(request.user.id);
    next();
};
