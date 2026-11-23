/**
 * @module
 * What `users` adds to the sweeps' world: a second account for `{userId}`-style segments, distinct
 * from the owner the sweep runs as.
 *
 * @see docs/build/module-removal.md#what-demo-remove-does-about-the-residue
 */
import type { SpecWorldContribution } from '@tests/spec-world';
import { createUser } from './factories';

/** A stored account, named by `{userId}` and by every `/users/...` path. */
export const specWorld: SpecWorldContribution = {
    key: 'userId',
    seed: () =>
        createUser({ email: 'fuzz-target@example.com', username: 'fuzz-target' }).then((user) =>
            String(user._id)
        ),
    pathPrefixes: [/^\/users\//]
};
