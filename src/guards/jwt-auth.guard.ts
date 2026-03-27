import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { getTokenBearer } from '@middlewares/get-auth.middleware';

/**
 * Guard that requires a valid authenticated user.
 * Returns 401 Unauthorized when no token or no resolved user is present.
 *
 * Replaces the Express isAuth middleware from middlewares/authorizations.ts.
 * Must be used AFTER GetAuthMiddleware has populated request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const token = getTokenBearer(request);

        if (!request.user || !token)
            throw new UnauthorizedException('Unauthorized');

        return true;
    }
}
