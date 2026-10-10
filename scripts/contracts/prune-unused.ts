/**
 * @module
 * The last step on the bundled OpenAPI document: drop every component nothing reaches, and every
 * tag no operation uses.
 *
 * Why it exists: the root keeps the shared components, and a deleted module leaves some of them
 * orphaned (a security scheme, a response only its routes used). Without this the published
 * contract keeps describing what the deployment no longer has.
 *
 * Why it runs LAST: `redocly bundle --remove-unused-components` runs too early. The steps before
 * this one add references (`ETag`, `IfMatchHeader`, `PreconditionFailed`, the 413 and 415
 * responses), and an early prune deletes components those steps are about to need.
 *
 * Reachability, not names: a component is kept when a `$ref` from outside `components`, or from a
 * kept component, points at it. A security scheme is kept when a `security` requirement names it.
 *
 * See: docs/api/contract-fragmentation.md
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** A JSON object, as far as this walk looks. */
type Json = Record<string, unknown>;

/** A bundled document, as far as this step reads it. */
interface BundledDocument extends Json {
    components?: Record<string, Record<string, unknown>>;
    tags?: { name: string }[];
}

/** The reference prefix every in-document component pointer starts with. */
const COMPONENT_PREFIX = '#/components/';

/** Narrows what `parse` hands back to an object. */
const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a walk over part of the document found. */
interface Findings {
    /** Component pointers (`#/components/<kind>/<name>`) referenced. */
    refs: Set<string>;
    /** Security scheme names a `security` requirement names. */
    schemes: Set<string>;
    /** Tag names an operation files itself under. */
    tags: Set<string>;
}

/** Records the scheme names in one `security` array. */
const collectSchemes = (requirements: unknown[], found: Findings): void => {
    for (const requirement of requirements)
        if (isObject(requirement))
            for (const scheme of Object.keys(requirement)) found.schemes.add(scheme);
};

/** Collects the pointers, scheme names and operation tags in `node` into `found`. */
const collect = (node: unknown, found: Findings, key = ''): void => {
    if (Array.isArray(node)) {
        if (key === 'security') collectSchemes(node, found);
        for (const item of node) {
            if (key === 'tags' && typeof item === 'string') found.tags.add(item);
            collect(item, found);
        }
        return;
    }
    if (!isObject(node)) return;

    for (const [name, value] of Object.entries(node))
        if (name === '$ref' && typeof value === 'string' && value.startsWith(COMPONENT_PREFIX))
            found.refs.add(value);
        else collect(value, found, name);
};

/** The pointer a component of `kind` and `name` is referenced by. */
const pointerOf = (kind: string, name: string): string => `${COMPONENT_PREFIX}${kind}/${name}`;

/**
 * Every component pointer reachable from outside `components`, following references through the
 * components they reach.
 */
const reachable = (document: BundledDocument, found: Findings): void => {
    const { components, ...rest } = document;
    collect(rest, found);

    const queue = [...found.refs];
    for (let pointer = queue.pop(); pointer !== undefined; pointer = queue.pop()) {
        const [kind, name] = pointer.slice(COMPONENT_PREFIX.length).split('/', 2);
        const before = new Set(found.refs);
        collect(components?.[kind]?.[name], found);
        queue.push(...[...found.refs].filter((ref) => !before.has(ref)));
    }
};

/**
 * The document without its unreferenced components and unused tags.
 *
 * @param bundled - the finished bundle, as YAML text
 * @returns the pruned bundle, as YAML text
 * @throws Error when the text is not a YAML object
 */
export const pruneUnused = (bundled: string): string => {
    // `yaml`'s YAML 1.2 loader; typed `unknown` until the guard narrows it.
    const parsed: unknown = parseYaml(bundled);
    if (!isObject(parsed))
        throw new Error('[openapi] the bundled document did not parse to an object.');
    const document: BundledDocument = parsed;

    const found: Findings = { refs: new Set(), schemes: new Set(), tags: new Set() };
    reachable(document, found);

    for (const [kind, entries] of Object.entries(document.components ?? {}))
        for (const name of Object.keys(entries)) {
            const used =
                kind === 'securitySchemes'
                    ? found.schemes.has(name)
                    : found.refs.has(pointerOf(kind, name));
            if (!used) Reflect.deleteProperty(entries, name);
        }

    if (document.tags) document.tags = document.tags.filter(({ name }) => found.tags.has(name));

    // `lineWidth: 0` turns off line folding, so diffs stay small.
    // https://eemeli.org/yaml/#tostring-options
    return stringifyYaml(document, { lineWidth: 0 });
};
