import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { EUserRoles } from '@models/users';

/**
 * Guard that requires the authenticated user to have the admin role.
 * Must be applied after JwtAuthGuard.
 * Returns 403 Forbidden when the user is missing or lacks the admin role.
 *
 * Replaces the Express isAdmin middleware from middlewares/authorizations.ts.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        if (!request.user)
            throw new ForbiddenException('Forbidden: Access denied.');

        if (!request.user.roles.includes(EUserRoles.ADMIN))
            throw new ForbiddenException("Forbidden: You don't have permission.");

        return true;
    }
}
