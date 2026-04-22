import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { IRequestContext } from '@nest/types/request-context';
import { fail } from '@nest/utils/http';

/**
 * Require an authenticated user.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<IRequestContext>();
        if (!request.user) fail(401, 'Unauthorized');
        return true;
    }
}
