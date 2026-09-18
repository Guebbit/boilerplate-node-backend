/**
 * @module
 * Tenants and memberships — the identity-and-access domain `kernel/permissions.ts` and
 * `kernel/ability.ts` ask about. Routeless on purpose: nothing in the boilerplate creates a shop
 * or grants a role over the wire, so there is no URL of its own to mount — see `./model.ts` for
 * why that still makes this a module rather than kernel code.
 *
 * Owns:   the tenant and membership collections, outright.
 * Shares: nothing over HTTP. `account`, `api-keys` and `users` are its only consumers, all
 *         through this barrel.
 *
 * See: docs/theory/authorization.md
 */

import type { AppModule } from '@kernel/registry';
import { membershipsOf } from './service';

/** This module's manifest entry: no routes, one personal-data section. */
export default {
    name: 'access',
    personalData: [
        {
            section: 'roles',
            // Scope only — never the tenant id. This deployment ships one shop, so the id adds
            // nothing a subject would recognise, and `role`/`scope` alone already answer "what can
            // this account do", which is what Art. 15 asks for here.
            collect: (subject) =>
                membershipsOf(subject.userId).then((memberships) =>
                    memberships.map((membership) => ({
                        role: membership.role,
                        scope: membership.scope
                    }))
                )
        }
    ]
} satisfies AppModule;
