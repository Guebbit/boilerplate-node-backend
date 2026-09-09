/**
 * @module
 * The one thing every service function in this module needs from the caller: which tenant it acts
 * for.
 */

import type { CallerContext } from '@infrastructure/http/request';

/**
 * The tenant id a `webhooks.read`/`webhooks.manage` caller always carries.
 *
 * Non-null by the authorization layer's own invariant, not by a check this function can make:
 * both permission keys are `scope: tenant` in `shared/authorization-keys.yaml`, and
 * `Caller.tenantId` is null only in platform scope (see its own doc comment) — a caller without
 * one never reaches a handler that calls this.
 */
export const tenantOf = (context: CallerContext): string => context.caller.tenantId!;
