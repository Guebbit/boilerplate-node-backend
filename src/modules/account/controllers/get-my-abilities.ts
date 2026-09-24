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
import {
    anonymousCaller,
    callerInScope,
    permissionModelVersion,
    PERMISSION_KEYS,
    PERMISSION_SUBJECTS
} from '@kernel/permissions';
import type { AuthContext } from '@types';

/**
 * The permission model's own version.
 *
 * Bumped when the KEYS change, not when a role does — a client caches these, and this is what
 * tells it the cache is about a different model rather than merely a different person. A
 * fingerprint of the declared set (see {@link permissionModelVersion}) rather than typed in or a
 * plain count, so a key rename or swap cannot be forgotten either: only reordering the same set
 * leaves it unchanged, and editing a role never touches it at all.
 */
const modelVersion = permissionModelVersion(PERMISSION_KEYS.map((entry) => entry.key));

/**
 * One scope's rules, in CASL's wire format.
 *
 * `packRules` is CASL's own and exists for exactly this: a tuple per rule with trailing absent
 * members dropped, which is what makes shipping a few dozen of them cheap. The frontend calls
 * `unpackRules` and builds the same `Ability` this server just built.
 * https://casl.js.org/v6/en/advanced/ability-to-json
 *
 * @param caller - the caller as resolved in ONE scope; never both at once
 */
const rulesFor = (caller: Parameters<typeof buildAbility>[0]) =>
    packRules(buildAbility(caller).rules);

/**
 * Answer the caller's own rules, in BOTH scopes.
 *
 * Both, because a request acts in one scope and a CLIENT renders from two: the shop's screens read
 * tenant keys, the health dashboard reads `platform.observability.any.read`, and they share one
 * navigation. Publishing tenant rules alone would leave the platform screens with nothing to grey
 * out, forcing them to gate on a tenant key that merely correlates — the guess this endpoint
 * abolishes everywhere else. The two lists stay apart, because the model refuses to let either
 * satisfy the other.
 */
export const getMyAbilities = (request: Request, response: Response) => {
    const context: AuthContext | undefined = request.authContext;

    // A stranger is the `guest` role in tenant scope and holds nothing over the installation, so
    // their platform list is empty rather than absent — same shape for every caller.
    const tenant = context ? callerInScope(context, 'tenant') : anonymousCaller();
    const platform = context ? callerInScope(context, 'platform') : undefined;

    successResponse(response, {
        // Absent rather than null for a caller with no shop: the contract has no nullable field.
        ...(tenant.tenantId ? { tenantId: tenant.tenantId } : {}),
        tenant: rulesFor(tenant),
        platform: platform ? rulesFor(platform) : [],
        version: modelVersion,
        subjects: PERMISSION_SUBJECTS
    });
};
