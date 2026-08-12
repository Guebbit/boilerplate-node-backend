/**
 * Every committed document this repo assembles from fragments.
 *
 * These are exactly the shared, domain-shaped files of `scripts/specIdentity.ts`: the ones that
 * exist twice — once here, once in the paired frontend — AND list every domain the app has. This
 * repo authors them; the frontend holds byte-identical copies and never edits them.
 *
 * The three files in `specIdentity.ts` that are NOT here are the ones with nothing to fragment:
 * `spectral.yaml` is a lint ruleset, `check-mutation-baseline.ts` and `gen-asyncapi-types.ts` are
 * tooling, and none of them names a domain. `src/types/asyncapi.ts` is absent for the opposite
 * reason — it is generated from `asyncapi.yaml` by `npm run genasyncapi`, so it follows a bundle
 * rather than being one.
 *
 * Adding a bundle is one entry here plus its spec file: the CLI, the staleness check and the
 * cross-cutting test all iterate this list.
 */

import type { IContractBundle } from './fragments';
import { openapiBundle } from './openapi';
import { asyncapiBundle } from './asyncapi';
import { analyticsEventsBundle } from './analyticsEvents';
import { seedIdentitiesBundle } from './seedIdentities';
import { brunoBundle, insomniaBundle, mockoonBundle } from './clientCollections';

export const CONTRACT_BUNDLES: readonly IContractBundle[] = [
    openapiBundle,
    asyncapiBundle,
    analyticsEventsBundle,
    seedIdentitiesBundle,
    brunoBundle,
    insomniaBundle,
    mockoonBundle
] as const;

/** One bundle by its CLI handle. */
export const findBundle = (name: string): IContractBundle | undefined =>
    CONTRACT_BUNDLES.find((bundle) => bundle.name === name);

export * from './fragments';
