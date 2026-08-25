/**
 * Requests the contract cannot describe, for the orders module.
 *
 * Emitted into every client collection after this module's contract-derived requests. A contract
 * declares valid calls and their declared answers, so the requests that prove the API REJECTS
 * things have no home in it.
 *
 * Seed facts are referred to as `{{seedToken}}` — never pasted — so a probe cannot drift from the
 * dataset it is probing. The tokens are declared in `scripts/contracts/client-collections-bundle.ts`, and
 * one this module invents fails the generator with the list of known ones.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

export const probes: Probe[] = [
    {
        name: 'Probe: the owner asking for their own soft-deleted order',
        why: `The dataset puts its one soft-deleted order on the NON-admin user for exactly this case, and the case is subtle: ownership-only scoping would allow it, and correct scoping refuses. Log in as the non-admin first (see the account probes), then send this — it must not return the order. An admin token on the same URL must.`,
        method: 'GET',
        path: '/orders/{{seedDeletedOrderId}}',
        auth: 'bearer'
    },
    {
        name: "Probe: another user's order",
        why: `The seeded admin's order, requested with whatever token the collection holds. As the non-admin this is the cross-tenant read the API must refuse; as the admin it is a legitimate one. Same URL, two answers — which is the whole of role scoping in one request.`,
        method: 'GET',
        path: '/orders/{{seedOrderId}}',
        auth: 'bearer'
    }
];
