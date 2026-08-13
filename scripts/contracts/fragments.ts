/**
 * The fragment bundler every shared, domain-shaped file in this repo is built with.
 *
 * THE PROBLEM IT SOLVES. A handful of files list every domain the app has — the REST contract, the
 * realtime contract, the demo dataset's identities, the analytics event names, the three API client
 * collections. Each of them is also byte-identical with the paired frontend, so each is a single
 * hand-maintained document that no module owns and that `rm -rf src/modules/products` cannot touch.
 *
 * THE SHAPE OF THE FIX. A module owns its slice as a fragment on disk; the published document is
 * the concatenation of those slices, stays COMMITTED, and is what every tool reads — spectral,
 * orval, Prism, the seed runner, Bruno, Mockoon, and `check:spec-identity`. Deleting a domain is
 * deleting its folder plus its entry in one ordered list.
 *
 * WHY IT NEVER PARSES. These documents carry comments, key order, quoting and indentation that a
 * parse-and-re-serialise round trip destroys: `openapi.yaml` alone holds 149 comment lines, and a
 * `js-yaml` round trip of it returns 3453 lines from 3062 with none of them. A lossy bundler can
 * never reproduce a hand-maintained file, and the bundle has to stay byte-identical with the copy
 * the frontend holds — so a fragment here is a VERBATIM SLICE of the original lines and bundling is
 * string concatenation. Round-trip identity is structural rather than hoped for, and
 * `tests/cross-cutting/contract-bundles.test.ts` asserts it for every bundle on every run.
 *
 * THE ONE THING CONCATENATION CANNOT DO is separate list items: JSON arrays and TypeScript object
 * literals need a comma BETWEEN slices and none after the last, which is a property of the join
 * rather than of any fragment. So a segment is either a file (pasted verbatim) or a group of files
 * joined by a separator — still no parsing, and a module fragment still never has to know whether
 * it happens to be last.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Repo root, from `scripts/contracts/`. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Fragments that are list items, joined rather than pasted.
 *
 * `separator` is what goes between two slices and nowhere else — `',\n'` for the entries of a JSON
 * array or a TypeScript object. Each fragment is right-trimmed before joining so it can be stored
 * with the trailing newline every editor adds.
 */
export interface IFragmentGroup {
    parts: readonly string[];
    separator: string;
}

/** A slice of a bundle: one file pasted verbatim, or several joined into a list. */
export type TSegment = string | IFragmentGroup;

/** One committed document and the fragments it is assembled from. */
export interface IContractBundle {
    /** CLI handle — `npm run contracts:bundle -- openapi`. */
    name: string;
    /** What the bundle is called on disk, for messages. */
    label: string;
    /** Absolute path of the committed document this produces. */
    output: string;
    /**
     * The document, in order. A function rather than an array so a bundle can derive its segments
     * from its section list instead of restating every path.
     */
    segments: () => readonly TSegment[];
    /**
     * True when this bundle's own fragments are generated rather than authored — today the three
     * client collections, which are derived from `openapi.yaml`. It is what orders a full run:
     * every authored bundle is assembled first, so the generator has a current contract to read.
     */
    generated?: boolean;
}

/**
 * Read a fragment, failing with the reason rather than an ENOENT.
 *
 * A missing fragment means a module was deleted without its entry leaving the bundle's section
 * list. That is deliberately an error and not a silent skip: these documents are shared with the
 * paired repo, and a bundler that quietly dropped a section would fork them — this side serving
 * endpoints, events or fixtures the other no longer has, with `check:spec-identity` the only thing
 * left to notice.
 */
const readFragment = (bundle: IContractBundle, file: string): string => {
    if (!existsSync(file))
        throw new Error(
            `[${bundle.name}] ${bundle.label} names a fragment that does not exist:\n` +
                `  ${path.relative(REPO_ROOT, file)}\n` +
                `  Deleting a domain means deleting its entry from the bundle's section list too —` +
                ` and mirroring both in the paired repo.`
        );
    return readFileSync(file, 'utf8');
};

/** One segment as it appears in the output: a verbatim paste, or a separator-joined list. */
const renderSegment = (bundle: IContractBundle, segment: TSegment): string =>
    typeof segment === 'string'
        ? readFragment(bundle, segment)
        : segment.parts
              .map((part) => readFragment(bundle, part).trimEnd())
              .join(segment.separator) + '\n';

/**
 * Reassemble a document from its fragments.
 *
 * No parse, no serialise, nothing that could normalise a quote or drop a comment.
 */
export const assembleBundle = (bundle: IContractBundle): string =>
    bundle
        .segments()
        .map((segment) => renderSegment(bundle, segment))
        .join('');

/**
 * The bundle as committed on disk.
 *
 * An absent file reads as the empty string rather than throwing: a bundle whose output does not
 * exist yet — a renamed output, a fresh checkout mid-migration — is the definition of stale, and
 * "stale, write it" is the answer the caller is asking this function to help give. Crashing here
 * turns the one command that would fix the state into the command that cannot run.
 */
export const readCommittedBundle = (bundle: IContractBundle): string =>
    existsSync(bundle.output) ? readFileSync(bundle.output, 'utf8') : '';

/** Every fragment a bundle is built from, flattened — what a staleness check watches. */
export const bundleFragments = (bundle: IContractBundle): string[] =>
    bundle
        .segments()
        .flatMap((segment) => (typeof segment === 'string' ? [segment] : [...segment.parts]));
