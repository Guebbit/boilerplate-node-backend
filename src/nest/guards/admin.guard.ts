import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { IRequestContext } from '@nest/types/request-context';
import { fail } from '@nest/utils/http';

/**
 * Require authenticated admin user.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<IRequestContext>();
        const user = request.user;
        if (!user) fail(403, 'Forbidden: Access denied.');
        const authenticatedUser = user as NonNullable<typeof user>;
        if (!authenticatedUser.admin)
            fail(403, "Forbidden: You don't have permission.");
        return true;
    }
}
