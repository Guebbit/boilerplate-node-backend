/**
 * Every document this repo produces from sources it owns.
 *
 * Two kinds, and the difference decides what is guarded. The AUTHORED ones — `openapi`, the two
 * asyncapi bundles, the analytics event names — are committed, and cover the shared, domain-shaped
 * files of `scripts/specIdentity.ts`: the ones that exist twice, once here and once in the paired
 * frontend, AND list every domain the app has. This repo authors them; the frontend holds
 * byte-identical copies and never edits them.
 *
 * `asyncapi` is the exception to the "exists twice" half: the frontend's copy is
 * `asyncapi.public.yaml`, the SHARED subset, while `asyncapi.yaml` — queues included — stays here
 * and is what this repo's own types are generated from. Both are built from one set of section
 * documents, so the two can never describe a shared channel differently.
 *
 * The GENERATED ones — the client collections — are `.gitignore`d and produced on demand from
 * `openapi.yaml`. They are listed here so `npm run contracts:bundle -- bruno` can find them, not
 * because anything checks them: an uncommitted file cannot be stale.
 *
 * The files in `specIdentity.ts` that are NOT here are the ones with nothing to fragment:
 * `spectral.yaml` is a lint ruleset, `check-mutation-baseline.ts` and `gen-asyncapi-types.ts` are
 * tooling, and none of them names a domain. `src/types/asyncapi.generated.ts` is absent for the
 * opposite reason — it is generated from `asyncapi.yaml` by `npm run gen:asyncapi`, so it follows a bundle
 * rather than being one. `db/demo/demo-data.json` is absent for a third reason: it is not assembled
 * from text at all — `npm run seed:export` seeds a throwaway database and publishes what the API
 * serves, so its staleness check is `check:seed-export` rather than this CLI.
 *
 * Adding a bundle is one entry here plus its spec file: the CLI, the staleness check and the
 * cross-cutting test all iterate this list.
 *
 * The three ways a document comes to exist are described on the types in `./fragments`. Only
 * `openapi` is COMPILED — `redocly bundle` over one standalone document per module — because it is
 * the one whose sources became whole documents; the rest are still concatenated slices or derived
 * whole from a bundle.
 */

import type { ContractBundle } from './fragments';
import { openapiBundle } from './openapi';
import { asyncapiBundle, asyncapiPublicBundle } from './asyncapi';
import { analyticsEventsBundle } from './analyticsEvents';
import { brunoBundle, insomniaBundle, mockoonBundle, postmanBundle } from './generateCollections';

export const CONTRACT_BUNDLES: readonly ContractBundle[] = [
    openapiBundle,
    asyncapiBundle,
    asyncapiPublicBundle,
    analyticsEventsBundle,
    brunoBundle,
    insomniaBundle,
    mockoonBundle,
    postmanBundle
] as const;

/** One bundle by its CLI handle. */
export const findBundle = (name: string): ContractBundle | undefined =>
    CONTRACT_BUNDLES.find((bundle) => bundle.name === name);

export * from './fragments';
