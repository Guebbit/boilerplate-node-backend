/**
 * Requests the contract cannot describe, for the orders module.
 *
 * `scripts/contracts/client-collections-bundle.ts` owns the rest: what a probe is for, where these
 * are emitted, and which `{{seedToken}}` values a probe may refer to.
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
