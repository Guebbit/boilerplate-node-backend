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

import {
    isMap,
    isScalar,
    isSeq,
    parseDocument,
    type Document,
    type YAMLMap,
    type YAMLSeq
} from 'yaml';
import { orderSections } from './section-order';
import { modulesWith } from '../modules-on-disk';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { readModuleFragment, TAG_FAMILY_OF_GROUP, type DeclaredTag } from './fragments';

/** What one module's `openapi.yaml` declares that the root has to know about. */
export interface ModuleFragment {
    /** The module folder name. */
    section: string;
    /** Every path the fragment declares, in the order it declares them. */
    paths: readonly string[];
    /** Every tag its operations use. */
    tags: readonly string[];
    /** The tags the fragment declares itself, with their description: the module's own say on what each is. */
    declaredTags?: readonly DeclaredTag[];
    /** The module's `group` (`module.yaml`): the family of any of its tags that names none. */
    group?: string;
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

/**
 * Declares every tag a fragment uses that the root does not already list: with the fragment's own
 * description when it declares the tag, as a bare `{ name }` when it only uses it. The first
 * fragment (in section order) to declare a name wins; a later one repeating it is ignored.
 */
const appendMissingTags = (document: Document, fragments: readonly ModuleFragment[]): void => {
    const tags = document.get('tags');
    const declared = new Set<string>();
    if (isSeq(tags))
        for (const item of tags.items) {
            // `yaml` node API: `isMap` guards a mapping node, `.get(key)` reads one entry's value.
            const name = isMap(item) ? item.get('name') : undefined;
            if (typeof name === 'string') declared.add(name);
        }

    const described = new Map<string, DeclaredTag>();
    for (const tag of fragments.flatMap(({ declaredTags }) => declaredTags ?? []))
        if (!described.has(tag.name)) described.set(tag.name, tag);

    const used = fragments.flatMap(({ tags: names }) => names);
    const wanted = [...new Set([...described.keys(), ...used])].filter(
        (name) => !declared.has(name)
    );
    for (const name of wanted)
        document.addIn(['tags'], document.createNode(described.get(name) ?? { name }));
};

/** The family of a tag that neither names one nor belongs to a module with a known group. */
const FALLBACK_FAMILY = 'Other';

/**
 * Which family each tag is listed under: the module that DECLARES a tag decides (the first one to
 * do so), else the first module whose operations use it. A borrowed tag therefore never lands in
 * two groups.
 */
const familyOfEachTag = (fragments: readonly ModuleFragment[]): Map<string, string> => {
    const families = new Map<string, string>();
    const fallbackOf = (fragment: ModuleFragment): string =>
        TAG_FAMILY_OF_GROUP[fragment.group ?? ''] ?? FALLBACK_FAMILY;
    for (const fragment of fragments)
        for (const tag of fragment.declaredTags ?? [])
            if (!families.has(tag.name))
                families.set(tag.name, tag['x-family'] ?? fallbackOf(fragment));
    for (const fragment of fragments)
        for (const name of fragment.tags)
            if (!families.has(name)) families.set(name, fallbackOf(fragment));

    return families;
};

/**
 * Lists every tag in exactly one `x-tagGroups` family, so a docs renderer (Redoc, Scalar) shows
 * families instead of one flat list. The root seeds the first group (`Core`, with `System`); the
 * rest are appended in the order their families are first met. A tag already in a group stays.
 * https://redocly.com/docs/api-reference-docs/specification-extensions/x-tag-groups
 */
const appendTagGroups = (document: Document, fragments: readonly ModuleFragment[]): void => {
    const existing = document.get('x-tagGroups');
    const groups = isSeq(existing)
        ? existing
        : (document.set('x-tagGroups', document.createNode([])), document.get('x-tagGroups'));
    if (!isSeq(groups)) return;

    const placed = new Set<string>();
    const tagsOf = new Map<string, YAMLSeq>();
    for (const group of groups.items) {
        if (!isMap(group)) continue;
        const name = group.get('name');
        const tags = group.get('tags');
        if (typeof name !== 'string' || !isSeq(tags)) continue;
        tagsOf.set(name, tags);
        for (const tag of tags.items) if (isScalar(tag)) placed.add(String(tag.value));
    }

    for (const [tag, family] of familyOfEachTag(fragments)) {
        if (placed.has(tag)) continue;
        let tags = tagsOf.get(family);
        if (!tags) {
            groups.add(document.createNode({ name: family, tags: [] }));
            const added = groups.items.at(-1);
            tags = isMap(added) ? (added.get('tags') as YAMLSeq) : undefined;
            if (!tags) continue;
            tagsOf.set(family, tags);
        }
        tags.add(document.createNode(tag));
    }
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
    appendTagGroups(document, fragments);

    return document.toString({ lineWidth: 0, indent: 4 });
};

/** The `group:` a module's `module.yaml` declares, when it has one. */
const groupOf = (modulesRoot: string, section: string): string | undefined => {
    const file = path.join(modulesRoot, section, 'module.yaml');
    if (!existsSync(file)) return undefined;
    // `yaml`'s loader; the `as` narrows its `any` to the one key read here.
    const group = (parseYaml(readFileSync(file, 'utf8')) as { group?: unknown } | null)?.group;

    return typeof group === 'string' ? group : undefined;
};

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
    const present = modulesWith(modulesRoot, 'openapi.yaml');

    return orderSections(preferredOrder, present).map((section) => {
        const parsed = readModuleFragment(modulesRoot, section);
        const operations = Object.values(parsed.paths ?? {}).flatMap((item) => Object.values(item));

        return {
            section,
            paths: Object.keys(parsed.paths ?? {}),
            tags: [...new Set(operations.flatMap((operation) => operation?.tags ?? []))],
            declaredTags: parsed.tags ?? [],
            group: groupOf(modulesRoot, section)
        };
    });
};
