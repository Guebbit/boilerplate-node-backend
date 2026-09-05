/**
 * @module
 * Requests the contract cannot describe, for the cart module.
 *
 * `scripts/contracts/client-collections-bundle.ts` owns the rest: what a probe is for, where these
 * are emitted, and which `{{seedToken}}` values a probe may refer to.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

/** The cart's probe collection — see the module header for what a probe is for. */
export const probes: Probe[] = [
    {
        name: 'Probe: checkout with an empty cart',
        why: `The failure half of the funnel. Clear the cart first, then send this: the API refuses and emits \`checkout_failed\`, the event the frontend also reports from its cart store. It is the only way to see that event without breaking something, and the seeded non-admin user starts with an empty cart precisely so the state is reachable.`,
        method: 'POST',
        path: '/cart/checkout',
        auth: 'bearer'
    },
    {
        name: 'Probe: add a product that does not exist',
        why: `A well-formed body naming an id nothing owns. The contract can describe the 404 but not a request that earns one, and this is the boundary where a cart would happily store a dangling reference if the service ever stopped checking.`,
        method: 'POST',
        path: '/cart',
        auth: 'bearer',
        body: {
            productId: '000000000000000000000000',
            quantity: 1
        }
    },
    {
        name: 'Probe: set a quantity on a product the storefront will not show',
        why: `The catalogue gate, from the quieter of the two routes that create a line. \`PUT /cart/{productId}\` writes as readily as \`POST /cart\` does, so it owes the same refusal — and it is the one where a missing gate would hide best, since a line naming a product nobody can see renders as nothing rather than as an error. The rule lives in \`cartItemSetById\`; this proves the route inherits it.`,
        method: 'PUT',
        path: '/cart/{{seedInactiveProductId}}',
        auth: 'bearer',
        body: {
            quantity: 1
        }
    },
    {
        name: 'Probe: a quantity the schema forbids',
        why: `Zero, where the contract requires at least one. Removing a line has its own endpoint, so a zero quantity is a validation failure rather than a shortcut — worth being able to prove.`,
        method: 'POST',
        path: '/cart',
        auth: 'bearer',
        body: {
            productId: '{{seedProductId}}',
            quantity: 0
        }
    }
];
