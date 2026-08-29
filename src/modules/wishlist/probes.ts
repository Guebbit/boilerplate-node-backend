/**
 * Requests the contract cannot describe, for the wishlist module.
 *
 * `scripts/contracts/client-collections-bundle.ts` owns the rest: what a probe is for, where these
 * are emitted, and which `{{seedToken}}` values a probe may refer to.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

export const probes: Probe[] = [
    {
        name: 'Probe: save a product the storefront will not show',
        why: `The visibility gate on the way IN. A hidden product is perfectly real and its id is perfectly well-formed, so the contract can describe the 404 but not a request that earns one — and a stale tab is all it takes to send this. Saving it would plant a line that renders as a hole on the wishlist page: a row pointing at a product the scoping rules then refuse to return.`,
        method: 'POST',
        path: '/wishlist',
        auth: 'bearer',
        body: {
            productId: '{{seedInactiveProductId}}'
        }
    },
    {
        name: 'Probe: move a product that was never saved',
        why: `The wishlist's exit, asked for a line the caller does not hold. It answers 404 rather than succeeding quietly, because a client moving something it cannot see has a stale view and needs to know — and because a silent success would report a cart write that never happened.`,
        method: 'POST',
        path: '/wishlist/{{seedSoftDeletedProductId}}/move-to-cart',
        auth: 'bearer'
    },
    {
        name: 'Probe: unsave a product that was never saved',
        why: `The same contract from the delete side. Worth its own request because the two share no code path: removal decides from the repository's filter matching nothing, where the move decides from reading the list first.`,
        method: 'DELETE',
        path: '/wishlist/000000000000000000000000',
        auth: 'bearer'
    },
    {
        name: 'Probe: an id no ObjectId can be built from',
        why: `422, not 404. \`Id\` is a plain string in the contract — a backend is free to use ULIDs — so the Mongo-shaped check lives in the controller, and this is the boundary that says a malformed id is a different answer from an absent one. Nothing in the contract can express the difference.`,
        method: 'DELETE',
        path: '/wishlist/not-an-object-id',
        auth: 'bearer'
    }
];
