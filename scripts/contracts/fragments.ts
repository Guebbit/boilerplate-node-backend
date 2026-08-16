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
export interface FragmentGroup {
    parts: readonly string[];
    separator: string;
}

/** A slice of a bundle: one file pasted verbatim, or several joined into a list. */
export type Segment = string | FragmentGroup;

/** What every committed document declares, however it is produced. */
interface BundleIdentity {
    /** CLI handle — `npm run contracts:bundle -- openapi`. */
    name: string;
    /** What the bundle is called on disk, for messages. */
    label: string;
    /** Absolute path of the committed document this produces. */
    output: string;
}

/** A document assembled from authored fragments on disk. */
export interface AssembledBundle extends BundleIdentity {
    /**
     * The document, in order. A function rather than an array so a bundle can derive its segments
     * from its section list instead of restating every path.
     */
    segments: () => readonly Segment[];
    generated?: false;
}

/**
 * A document produced from authored source files by an EXTERNAL bundler.
 *
 * `openapi.yaml` is the one. Its sources are standalone OpenAPI documents — one per module, plus a
 * root holding what no module owns — joined by `redocly bundle`, which resolves `$ref` the way the
 * rest of the ecosystem does. That trades the bundle's comments away, because a parse cannot keep
 * them; the comments that mattered are the ones in the module files, and those survive where they
 * were written.
 *
 * Like an assembled bundle and unlike a generated one, this is authored source, so it runs in the
 * FIRST phase of a full run and the collections downstream read a current contract.
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
 * there is nothing on disk to concatenate and no intermediate for anyone to hand-edit. `generated`
 * is what orders a full run — every authored bundle is assembled first, so the generator has a
 * current contract to read.
 */
export interface GeneratedBundle extends BundleIdentity {
    content: () => string;
    generated: true;
}

/** One committed document, and how it comes to exist. */
export type ContractBundle = AssembledBundle | CompiledBundle | GeneratedBundle;

/**
 * Whether this bundle is derived from another committed document rather than from authored source.
 *
 * It is what orders a full run: everything authored — concatenated or compiled — is produced first,
 * so the client collections downstream read a current contract rather than the previous one.
 */
export const isGenerated = (bundle: ContractBundle): bundle is GeneratedBundle =>
    'generated' in bundle && bundle.generated === true;

const isCompiled = (bundle: ContractBundle): bundle is CompiledBundle =>
    'compiled' in bundle && bundle.compiled === true;

/**
 * Read a fragment, failing with the reason rather than an ENOENT.
 *
 * A missing fragment means a module was deleted without its entry leaving the bundle's section
 * list. That is deliberately an error and not a silent skip: these documents are shared with the
 * paired repo, and a bundler that quietly dropped a section would fork them — this side serving
 * endpoints, events or fixtures the other no longer has, with `check:spec-identity` the only thing
 * left to notice.
 */
const readFragment = (bundle: ContractBundle, file: string): string => {
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
const renderSegment = (bundle: ContractBundle, segment: Segment): string =>
    typeof segment === 'string'
        ? readFragment(bundle, segment)
        : segment.parts
              .map((part) => readFragment(bundle, part).trimEnd())
              .join(segment.separator) + '\n';

/**
 * Produce a document: concatenate its fragments, or ask the generator for the whole thing.
 *
 * The assembled path does no parse and no serialise, so nothing can normalise a quote or drop a
 * comment. The generated path has no fragments to preserve — its input is `openapi.yaml`, which the
 * assembled path already produced faithfully.
 */
export const assembleBundle = (bundle: ContractBundle): string =>
    isGenerated(bundle) || isCompiled(bundle)
        ? bundle.content()
        : bundle
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
export const readCommittedBundle = (bundle: ContractBundle): string =>
    existsSync(bundle.output) ? readFileSync(bundle.output, 'utf8') : '';

/**
 * Every fragment a bundle is built from, flattened — what a staleness check watches.
 *
 * A generated bundle has none: nothing on disk stands between `openapi.yaml` and its output.
 */
export const bundleFragments = (bundle: ContractBundle): string[] =>
    isGenerated(bundle)
        ? []
        : isCompiled(bundle)
          ? [...bundle.sources()]
          : bundle
                .segments()
                .flatMap((segment) =>
                    typeof segment === 'string' ? [segment] : [...segment.parts]
                );
