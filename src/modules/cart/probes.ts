/**
 * Requests the contract cannot describe, for the cart module.
 *
 * Emitted into every client collection after this module's contract-derived requests. A contract
 * declares valid calls and their declared answers, so the requests that prove the API REJECTS
 * things have no home in it.
 *
 * Seed facts are referred to as `{{seedToken}}` — never pasted — so a probe cannot drift from the
 * dataset it is probing. The tokens are declared in `scripts/contracts/generate-collections.ts`, and
 * one this module invents fails the generator with the list of known ones.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

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
