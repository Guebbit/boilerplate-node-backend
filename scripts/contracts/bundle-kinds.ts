/**
 * What a contract bundle IS: the shape every entry in `bundle-registry.ts` declares, and the three questions
 * the CLI and the staleness check ask of one.
 *
 * Two kinds, and the only difference is where the input comes from. A COMPILED bundle is built
 * from authored files in this repo. A GENERATED one is built from a document this repo has already
 * committed. That single distinction is what orders a full run: everything compiled is written
 * first, so the client collections downstream read a current `openapi.yaml` rather than the
 * previous one.
 *
 * NO BUNDLE IS CONCATENATED BY THIS FILE. Each one owns its own build and they no longer share a
 * mechanism — `openapi.yaml` goes through `redocly bundle`, the AsyncAPI pair through the YAML AST.
 * What is left here is only what all of them have in common: an identity, a way to produce the
 * text, and a way to read the committed copy so the two can be compared.
 *
 * `tests/cross-cutting/contract-bundles.test.ts` asserts that comparison on every run.
 *
 * See: docs/api/contract-fragmentation.md#the-eight-bundles
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Repo root, from `scripts/contracts/`. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** What every committed document declares, however it is produced. */
interface BundleIdentity {
    /** CLI handle — `npm run contracts:bundle -- openapi`. */
    name: string;
    /** What the bundle is called on disk, for messages. */
    label: string;
    /** Absolute path of the committed document this produces. */
    output: string;
    /**
     * Whether the paired frontend holds a copy of this document, and so whether it belongs in
     * `scripts/spec-identity.ts`.
     *
     * Absent means yes, because publishing a document built from every domain's sources is what
     * these bundles are for. `asyncapi.yaml` is the one `false`: the frontend receives
     * `asyncapi.public.yaml`, the subset holding the channels it can actually reach, so the full
     * contract — queues included — stays here and is compared against nothing.
     *
     * Declared rather than inferred from the path so `contract-bundles.test.ts` can hold both
     * halves of the rule: shared bundles must be in the cross-repo list, and a bundle marked
     * backend-only must not be.
     */
    shared?: false;
}

/**
 * A document produced from AUTHORED SOURCE FILES in this repo.
 *
 * Three of them: `openapi.yaml` joined by `redocly bundle`, and the two AsyncAPI documents merged
 * through the YAML AST. How is each bundle's own business — what this kind declares is that its
 * inputs are hand-written, which is why it runs in the FIRST phase of a full run and the
 * collections downstream read a current contract.
 */
export interface CompiledBundle extends BundleIdentity {
    content: () => string;
    /** The authored files it is compiled from — what a staleness message points at. */
    sources: () => readonly string[];
    compiled: true;
}

/**
 * A document produced whole, from a document this repo already committed.
 *
 * The client collections are these: they are derived from `openapi.yaml` rather than written, so
 * there is nothing authored standing between the contract and the document, and no intermediate for
 * anyone to hand-edit. `generated` is what orders a full run — every compiled bundle is written
 * first, so the generator has a current contract to read.
 */
export interface GeneratedBundle extends BundleIdentity {
    content: () => string;
    generated: true;
}

/** One committed document, and how it comes to exist. */
export type ContractBundle = CompiledBundle | GeneratedBundle;

/**
 * Whether this bundle is derived from another committed document rather than from authored source.
 *
 * It is what orders a full run: everything compiled is produced first, so the client collections
 * downstream read a current contract rather than the previous one.
 *
 * The flag's PRESENCE is the discriminant — only a generated bundle carries the key at all, so
 * there is no value to compare against.
 */
export const isGenerated = (bundle: ContractBundle): bundle is GeneratedBundle =>
    'generated' in bundle;

/**
 * Produce a document by asking the bundle for it.
 *
 * A single call because the two kinds differ in where their input comes from, not in how the text
 * is made: each one already knows how to build itself, and the ordering that keeps a generated
 * bundle reading a fresh contract is `build-contract-bundles.ts`'s job, not this function's.
 */
export const assembleBundle = (bundle: ContractBundle): string => bundle.content();

/**
 * The bundle as committed on disk.
 *
 * An absent file reads as the empty string rather than throwing: a bundle whose output does not
 * exist yet — a renamed output, a fresh checkout mid-migration — is the definition of stale, and
 * "stale, write it" is the answer the caller is asking this function to help give. Crashing here
 * turns the one command that would fix the state into the command that cannot run.
 */
export const readCommittedBundle = (bundle: ContractBundle): string =>
    existsSync(bundle.output) ? readFileSync(bundle.output, 'utf8') : '';

/**
 * Every authored file a bundle is built from — what a staleness check watches.
 *
 * A generated bundle has none: nothing authored stands between `openapi.yaml` and its output.
 */
export const bundleFragments = (bundle: ContractBundle): string[] =>
    isGenerated(bundle) ? [] : [...bundle.sources()];
