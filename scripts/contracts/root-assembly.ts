/**
 * @module
 * The root OpenAPI document, completed from what the modules ship — the half of "adding a module
 * edits nothing outside its folder" that the contract needed.
 *
 * `shared/contracts/openapi.root.yaml` keeps one `$ref` per module path, in the narrative order
 * the bundle has always had. That list is a PREFERENCE, not a registry, the same as the section
 * order (`section-order.ts`): membership is what the module fragments declare on disk.
 *
 * Pure: takes the root's text and what each fragment declares, returns the text to bundle. The
 * caller owns the disk.
 *
 * See: docs/theory/module-lifecycle.md#3-the-fragments-and-their-section-entries
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { orderSections } from './section-order';

/** What one module's `openapi.yaml` declares that the root has to know about. */
export interface ModuleFragment {
    /** The module folder name. */
    section: string;
    /** Every path the fragment declares, in the order it declares them. */
    paths: readonly string[];
    /** Every tag its operations use. */
    tags: readonly string[];
}

/** A `$ref` into a module fragment's path item — what the root's `paths` holds per module path. */
const PATH_REF = /^\.\.\/\.\.\/src\/modules\/([^/]+)\/openapi\.yaml#\/paths\/(.+)$/;

/** JSON Pointer escaping: `~` then `/`, in that order. */
const encodePointer = (segment: string): string =>
    segment.replaceAll('~', '~0').replaceAll('/', '~1');

/** The `$ref` the root uses for one module path. */
export const pathRefFor = (section: string, urlPath: string): string =>
    `../../src/modules/${section}/openapi.yaml#/paths/${encodePointer(urlPath)}`;

/** The `$ref` string of a path item, or `undefined` for one the root declares itself. */
const refOf = (item: unknown): string | undefined => {
    if (!isMap(item)) return undefined;
    const ref = item.get('$ref');
    return typeof ref === 'string' ? ref : undefined;
};

/**
 * Drops every root entry pointing at a path no fragment declares any more, and returns the refs
 * that survive. A deleted module thereby needs no edit to the root.
 */
const pruneStaleReferences = (
    paths: YAMLMap,
    fragments: readonly ModuleFragment[]
): Set<string> => {
    const declared = new Set(
        fragments.flatMap(({ section, paths: urls }) => urls.map((url) => pathRefFor(section, url)))
    );
    const kept = new Set<string>();
    // Collected first, deleted after: `paths.items` is the live array the delete edits.
    const stale = paths.items.filter((pair) => {
        const ref = isScalar(pair.key) ? refOf(pair.value) : undefined;
        if (ref === undefined || !PATH_REF.test(ref)) return false;
        if (declared.has(ref)) kept.add(ref);
        return !declared.has(ref);
    });
    for (const pair of stale) paths.delete(pair.key);

    return kept;
};

/** Appends a `$ref` entry for every fragment path the root does not yet reference. */
const appendMissingPaths = (
    document: Document,
    paths: YAMLMap,
    fragments: readonly ModuleFragment[],
    kept: ReadonlySet<string>
): void => {
    for (const { section, paths: urls } of fragments)
        for (const url of urls) {
            const ref = pathRefFor(section, url);
            if (!kept.has(ref)) paths.set(url, document.createNode({ $ref: ref }));
        }
};

/** Declares, as a bare `{ name }`, every tag a fragment uses that the root does not already list. */
const appendMissingTags = (document: Document, fragments: readonly ModuleFragment[]): void => {
    const tags = document.get('tags');
    const declared = new Set<string>();
    if (isSeq(tags))
        for (const item of tags.items) {
            const name = isMap(item) ? item.get('name') : undefined;
            if (typeof name === 'string') declared.add(name);
        }

    const missing = [...new Set(fragments.flatMap(({ tags: used }) => used))].filter(
        (name) => !declared.has(name)
    );
    for (const name of missing) document.addIn(['tags'], document.createNode({ name }));
};

/**
 * The root document with its module path index and tag list made to match the fragments.
 *
 * Existing entries keep their place; entries for vanished paths are dropped; new paths and tags
 * are appended in the fragments' own order. Comments are preserved (the document is edited, not
 * re-serialised from a plain object).
 *
 * @param rootText - `shared/contracts/openapi.root.yaml`, verbatim
 * @param fragments - every module fragment on disk, in the order they should be appended
 * @returns the YAML to hand to `redocly bundle`
 * @throws Error if the root has no `paths` map
 */
export const assembleRoot = (rootText: string, fragments: readonly ModuleFragment[]): string => {
    // `yaml`'s Document API keeps comments, anchors and key order while we edit.
    // https://eemeli.org/yaml/#documents
    const document = parseDocument(rootText);
    const paths = document.get('paths');
    if (!isMap(paths)) throw new Error('[openapi] the root document has no `paths` map.');

    const kept = pruneStaleReferences(paths, fragments);
    appendMissingPaths(document, paths, fragments, kept);
    appendMissingTags(document, fragments);

    return document.toString({ lineWidth: 0, indent: 4 });
};

/** One operation, as far as this reader looks: the tags it files itself under. */
interface FragmentOperation {
    tags?: string[];
}

/** A fragment's `paths`, as far as this reader looks. */
interface FragmentDocument {
    paths?: Record<string, Record<string, FragmentOperation | undefined>>;
}

/**
 * What every module under `modulesRoot` that ships an `openapi.yaml` declares, in section order.
 *
 * Discovery is the folder listing — the same rule the bundlers use everywhere else — so a module
 * folder is enough to be in the contract.
 *
 * @param modulesRoot - the `src/modules` directory (the real one, or a scratch tree)
 * @param preferredOrder - the narrative order; modules it does not name are appended alphabetically
 */
export const readModuleFragments = (
    modulesRoot: string,
    preferredOrder: readonly string[]
): ModuleFragment[] => {
    const present = readdirSync(modulesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(modulesRoot, name, 'openapi.yaml')));

    return orderSections(preferredOrder, present).map((section) => {
        const parsed = parseDocument(
            readFileSync(path.join(modulesRoot, section, 'openapi.yaml'), 'utf8')
        ).toJS() as FragmentDocument;
        const operations = Object.values(parsed.paths ?? {}).flatMap((item) => Object.values(item));

        return {
            section,
            paths: Object.keys(parsed.paths ?? {}),
            tags: [...new Set(operations.flatMap((operation) => operation?.tags ?? []))]
        };
    });
};
