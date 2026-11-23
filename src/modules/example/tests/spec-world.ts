/**
 * @module
 * What `example` adds to the sweeps' world: a stored example for the translation paths that name
 * an entity of kind `example`. `example` is the translatable entity every checkout keeps, so those
 * paths resolve to a real row whichever shop modules are deployed.
 *
 * @see docs/build/module-removal.md#what-demo-remove-does-about-the-residue
 */
import type { SpecWorldContribution } from '@tests/spec-world';
import { createExample } from './factories';

/** A stored example owned by the account the sweep runs as. */
export const specWorld: SpecWorldContribution = {
    key: 'exampleId',
    seed: (owner) => createExample({ userId: String(owner._id) }).then((row) => String(row._id)),
    pathPrefixes: [/^\/locales\/translations\//],
    // The translation paths name the entity kind, and the seeded row is an example.
    literals: { entityType: 'example' }
};
