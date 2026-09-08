/**
 * @module
 * `GET /account/abilities` — the rules the server enforces, packed for a client to evaluate.
 *
 * The point is that there is ONE rule set. A client that decides what to grey out from its own
 * copy of the policy keeps a duplicate, and the duplicate drifts: the drift is silent until
 * somebody is shown a button that answers 403, or hidden from one they were entitled to.
 *
 * **The client's copy has no authority.** It decides what to RENDER, never what is allowed —
 * every request is re-evaluated server-side, and this endpoint changes nothing about that. It is
 * published because the alternative is every client inventing the same guess.
 *
 * Answered for an anonymous caller too: a stranger holds the `guest` role, which is a value in the
 * model rather than an absence.
 */

import type { Request, Response } from 'express';
import { packRules } from '@casl/ability/extra';
import { successResponse } from '@infrastructure/http/response';
import { buildAbility } from '@kernel/ability';
import { anonymousCaller, callerInScope, PERMISSION_KEYS } from '@kernel/permissions';

/**
 * The permission model's own version.
 *
 * Bumped when the KEYS change, not when a role does — a client caches these, and this is what
 * tells it the cache is about a different model rather than merely a different person. Derived
 * from the declared set rather than typed in, so it cannot be forgotten: adding or removing a key
 * changes it, editing a role does not.
 */
const modelVersion = PERMISSION_KEYS.length;

/**
 * Answer the caller's own rules, in tenant scope.
 *
 * Tenant scope because that is what a shop's client renders. Platform work resolves its own caller
 * per key inside the guard and has no screen here to grey out.
 */
export const getMyAbilities = (request: Request, response: Response) => {
    const caller = request.authContext
        ? callerInScope(request.authContext, 'tenant')
        : anonymousCaller();

    successResponse(response, {
        // Absent rather than null in platform scope: the contract has no nullable field.
        ...(caller.tenantId ? { tenantId: caller.tenantId } : {}),
        scope: caller.scope,
        /*
         * `packRules` is CASL's own wire format and exists for exactly this: a tuple per rule with
         * trailing absent members dropped, which is what makes shipping a few dozen of them cheap.
         * The frontend calls `unpackRules` and builds the same `Ability` this server just used.
         */
        rules: packRules(buildAbility(caller).rules),
        version: modelVersion
    });
};
