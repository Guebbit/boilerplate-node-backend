/**
 * @module
 * The one thing every service function in this module needs from the caller: which tenant it acts
 * for. Same shape as `webhooks/services/context.ts`.
 */

import type { CallerContext } from '@infrastructure/http/request';

/**
 * The tenant id an `apikeys.read`/`apikeys.manage` caller always carries.
 *
 * Both permission keys are `scope: tenant` in `shared/authorization-keys.yaml`, so a caller who
 * reached a handler that calls this is a `'tenant'`-scope `Caller` by the authorization layer's own
 * invariant — the narrow below is what lets the compiler prove it, no `!` needed. The throw is
 * unreachable in practice; it exists because the invariant lives in a YAML file this function
 * cannot see, not in the type.
 *
 * @throws Error if the caller somehow reached here in platform scope — a routing bug, not a user's
 */
export const tenantOf = (context: CallerContext): string => {
    if (context.caller.scope !== 'tenant') {
        throw new Error(
            '[api-keys] tenantOf called with a platform-scope caller — api-keys permissions are ' +
                'all tenant-scoped, so this route must be misconfigured.'
        );
    }

    return context.caller.tenantId;
};
