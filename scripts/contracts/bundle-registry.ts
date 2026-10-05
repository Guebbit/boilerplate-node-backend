/**
 * Every document this repo produces from sources it owns.
 *
 * Two kinds, and the difference decides what is guarded. The AUTHORED ones cover the shared files
 * of `scripts/pairing/spec-identity.ts` — the ones existing twice, here and in the paired frontend,
 * which holds byte-identical copies and never edits them; `asyncapi.yaml` and
 * `asyncapi.public.yaml` are committed here too, but `openapi.yaml` is `.gitignore`d and rebuilt on
 * every install, same as the GENERATED ones (the client collections) below it, listed only so the
 * CLI can find them by name: an uncommitted file cannot be stale.
 *
 * One publishes a SUBSET: `asyncapi.yaml` keeps every channel because this repo's own types come
 * from it, and the frontend receives the public half.
 *
 * Adding a bundle is one entry here plus its spec file: the CLI, the staleness check and the
 * cross-cutting test all iterate this list.
 *
 * See: docs/api/contract-fragmentation.md#the-seven-bundles
 */

import type { ContractBundle } from './bundle-kinds';
import { openapiBundle } from './openapi-bundle';
import { asyncapiBundle, asyncapiPublicBundle } from './asyncapi-bundles';
import type { CollectionTool } from '@guebbit/openapi-runnable-collections';
import path from 'node:path';
import { REPO_ROOT } from './bundle-kinds';

/*
 * The collections load app code (the seed values), and `api/` does not exist yet while
 * `postinstall` bundles. So their module is imported only when a collection is actually asked for,
 * and the dependency-cruiser rule `contracts-bundler-loads-no-generated-code` keeps it that way.
 */

/**
 * One tool's collection as a generated bundle entry; its content loads on demand.
 *
 * @param tool - which tool's format to render
 * @param file - the file name at the repo root
 * @returns the entry the registry lists
 */
const collectionBundle = (tool: CollectionTool, file: string): ContractBundle => ({
    name: tool,
    generated: true,
    label: file,
    output: path.join(REPO_ROOT, file),
    // Dynamic import: node's `import()` of a module, resolved only when this bundle is built.
    content: () => import('./client-collections-bundle').then((m) => m.collectionContent(tool))
});

// Written to the repo root as `contract.<tool>.<ext>` next to `openapi.yaml`; `.gitignore` keeps
// them out of the repo. Insomnia's is `.json` by the tool's own export convention.
const brunoBundle = collectionBundle('bruno', 'contract.bruno.yml');
const insomniaBundle = collectionBundle('insomnia', 'contract.insomnia.json');
const mockoonBundle = collectionBundle('mockoon', 'contract.mockoon.json');
const postmanBundle = collectionBundle('postman', 'contract.postman.json');

/** Every contract bundle the repo knows, authored and generated alike. */
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
