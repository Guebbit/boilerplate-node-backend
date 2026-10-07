/**
 * @module
 * Optional capability, in its own file: requests the contract cannot describe, which the
 * generated API client collection runs as probes. Delete the file to drop it.
 *
 * `scripts/contracts/client-collections-bundle.ts` owns what a probe is for and where it lands.
 */

import type { Probe } from '@guebbit/openapi-runnable-collections';

/** The example module's probe collection. */
export const probes: Probe[] = [
    {
        name: 'Probe: read a published example that does not exist',
        why: `The public door answers 404 for an id nobody holds, exactly as it does for a draft: a stranger must not be able to tell the two apart. The contract can describe the 404 but not a request that earns one.`,
        method: 'GET',
        path: '/examples/published/000000000000000000000000'
    },
    {
        name: 'Probe: edit an example with an id no ObjectId can be built from',
        why: `404, the same answer as an absent id. \`Id\` is a plain string in the contract, so the Mongo-shaped check lives in the controller, and a path id it cannot build is refused like one that names nothing.`,
        method: 'PATCH',
        path: '/examples/not-an-object-id',
        auth: 'bearer',
        body: { title: 'x' }
    }
];
