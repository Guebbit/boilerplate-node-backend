import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { userModel as Users } from '@models/users';
import { verifyAccessToken } from '@middlewares/auth-jwt';
import type { IRequestContext } from '@nest/types/request-context';

/**
 * Global best-effort authentication guard.
 *
 * It never blocks requests. When a valid bearer token exists,
 * it enriches request.user for downstream guards/controllers.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<IRequestContext>();
        const authorizationHeader = request.headers.authorization;
        const token = authorizationHeader?.split(' ')[1];

        if (!token) return true;

        try {
            const { id } = await verifyAccessToken(token);
            const user = await Users.findById(id);
            if (user) request.user = user;
        } catch {
            // Invalid/expired token should not block public endpoints.
        }

        return true;
    }
}
