/**
 * Every document this repo produces from sources it owns.
 *
 * Two kinds, and the difference decides what is guarded. The AUTHORED ones are committed and cover
 * the shared files of `scripts/spec-identity.ts` — the ones existing twice, here and in the paired
 * frontend, which holds byte-identical copies and never edits them. The GENERATED ones (the client
 * collections) are `.gitignore`d and listed only so the CLI can find them by name: an uncommitted
 * file cannot be stale.
 *
 * One publishes a SUBSET: `asyncapi.yaml` keeps every channel because this repo's own types come
 * from it, and the frontend receives the public half.
 *
 * Adding a bundle is one entry here plus its spec file: the CLI, the staleness check and the
 * cross-cutting test all iterate this list.
 *
 * See: docs/api/contract-fragmentation.md#the-eight-bundles
 */

import type { ContractBundle } from './bundle-kinds';
import { openapiBundle } from './openapi-bundle';
import { asyncapiBundle, asyncapiPublicBundle } from './asyncapi-bundles';
import {
    brunoBundle,
    insomniaBundle,
    mockoonBundle,
    postmanBundle
} from './client-collections-bundle';

export const CONTRACT_BUNDLES: readonly ContractBundle[] = [
    openapiBundle,
    asyncapiBundle,
    asyncapiPublicBundle,
    brunoBundle,
    insomniaBundle,
    mockoonBundle,
    postmanBundle
] as const;

/** One bundle by its CLI handle. */
export const findBundle = (name: string): ContractBundle | undefined =>
    CONTRACT_BUNDLES.find((bundle) => bundle.name === name);

export * from './bundle-kinds';
