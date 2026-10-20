/**
 * @module
 * The shared validation labels (`validation.attributes` in `src/locales/<locale>.json`) that only
 * a removed module's request fields used.
 *
 * The shared dictionaries label every field a request can carry, and
 * `tests/cross-cutting/validation-attributes.test.ts` refuses a label nothing uses. A label goes
 * when a removed module's contract names its field and no surviving request does.
 * Read BEFORE the folders go ({@link readRemovedFields}), in the order `demo-remove-authorization.ts`
 * keeps.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { isPlainObject } from '@infrastructure/object-guards';
import { modulesWith } from '../modules-on-disk';
import type { RemovalNote } from './demo-remove-registry';

/** Where the shared dictionaries live, relative to the repo root. */
const SHARED_LOCALES = path.join('src', 'locales');

/**
 * Every parsed `openapi*.yaml` in one folder.
 * @param directory - a module folder, or `shared/contracts`
 */
const contractsIn = (directory: string): unknown[] =>
    existsSync(directory)
        ? readdirSync(directory)
              .filter((name) => /^openapi.*\.yaml$/.test(name))
              .map((name): unknown => parseYaml(readFileSync(path.join(directory, name), 'utf8')))
        : [];

/**
 * Calls `visit` on every object under a parsed YAML node, depth first.
 * @param node - any parsed YAML node
 * @param visit - called once per object
 */
const eachObject = (node: unknown, visit: (object: Record<string, unknown>) => void): void => {
    if (Array.isArray(node)) {
        for (const item of node) eachObject(item, visit);
        return;
    }
    if (!isPlainObject(node)) return;
    visit(node);
    for (const child of Object.values(node)) eachObject(child, visit);
};

/**
 * Every `properties` key under the given roots, following each `$ref` into `schemas` by its last
 * segment, which is how fragments name a sibling's component.
 * @param roots - where to start
 * @param schemas - every component schema by name
 */
const reachableFields = (roots: unknown[], schemas: Record<string, unknown>): Set<string> => {
    const fields = new Set<string>();
    const followed = new Set<string>();
    const visit = (object: Record<string, unknown>): void => {
        if (isPlainObject(object.properties))
            for (const name of Object.keys(object.properties)) fields.add(name);
        const target = typeof object.$ref === 'string' ? object.$ref.split('/').at(-1) : undefined;
        if (target === undefined || followed.has(target)) return;
        followed.add(target);
        eachObject(schemas[target], visit);
    };
    for (const root of roots) eachObject(root, visit);
    return fields;
};

/**
 * The JSON schema of one operation's request body, the one the client generator exports as
 * `<Operation>Body`. A multipart body is not one of those.
 * @param requestBody - one operation's `requestBody`
 */
const jsonBody = (requestBody: unknown): unknown[] =>
    isPlainObject(requestBody) &&
    isPlainObject(requestBody.content) &&
    isPlainObject(requestBody.content['application/json'])
        ? [requestBody.content['application/json'].schema]
        : [];

/**
 * What a request can carry, across a set of parsed contracts — the set the validation-attributes
 * test reads off the generated `*Body` schemas: every field reachable from a JSON request body,
 * plus every query parameter name.
 * @param contracts - parsed `openapi*.yaml` documents
 */
const requestFields = (contracts: unknown[]): Set<string> => {
    const schemas: Record<string, unknown> = {};
    const bodies: unknown[] = [];
    const queries = new Set<string>();
    eachObject(contracts, (object) => {
        if (isPlainObject(object.components) && isPlainObject(object.components.schemas))
            Object.assign(schemas, object.components.schemas);
        bodies.push(...jsonBody(object.requestBody));
        if (object.in === 'query' && typeof object.name === 'string') queries.add(object.name);
    });
    return new Set([...reachableFields(bodies, schemas), ...queries]);
};

/**
 * Every field a set of parsed contracts names anywhere, request or response.
 * @param contracts - parsed `openapi*.yaml` documents
 */
const anyFields = (contracts: unknown[]): Set<string> => {
    const fields = new Set<string>();
    eachObject(contracts, (object) => {
        if (isPlainObject(object.properties))
            for (const name of Object.keys(object.properties)) fields.add(name);
    });
    return fields;
};

/**
 * The fields the modules about to be removed name and no surviving request carries, read while
 * their folders exist.
 * @param repoRoot - repo root
 * @param names - the modules about to be removed
 */
export const readRemovedFields = (
    repoRoot: string,
    names: readonly string[]
): ReadonlySet<string> => {
    const modulesRoot = path.join(repoRoot, 'src', 'modules');
    const survivors = modulesWith(modulesRoot, 'openapi.yaml')
        .filter((name) => !names.includes(name))
        .map((name) => path.join(modulesRoot, name));
    const surviving = requestFields(
        [...survivors, path.join(repoRoot, 'shared', 'contracts')].flatMap((directory) =>
            contractsIn(directory)
        )
    );
    const removed = anyFields(names.flatMap((name) => contractsIn(path.join(modulesRoot, name))));

    return new Set([...removed].filter((field) => !surviving.has(field)));
};

/**
 * Drop each removed field's label from every shared dictionary. A JSON round trip: the files are
 * exactly `JSON.stringify` with four spaces, so nothing else in them moves.
 * @param repoRoot - the checkout to edit
 * @param fields - what {@link readRemovedFields} found
 */
export const stripValidationLabels = (
    repoRoot: string,
    fields: ReadonlySet<string>
): RemovalNote[] => {
    const directory = path.join(repoRoot, SHARED_LOCALES);

    return readdirSync(directory)
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) => {
            const full = path.join(directory, file);
            const dictionary = JSON.parse(readFileSync(full, 'utf8')) as {
                validation?: { attributes?: Record<string, string> };
            };
            const attributes = dictionary.validation?.attributes ?? {};
            const dropped = Object.keys(attributes).filter((field) => fields.has(field));
            if (dropped.length === 0) return [];

            for (const field of dropped) Reflect.deleteProperty(attributes, field);
            writeFileSync(full, `${JSON.stringify(dictionary, null, 4)}\n`);
            return [
                {
                    file: path.join(SHARED_LOCALES, file),
                    detail: `removed ${String(dropped.length)} validation label(s)`
                }
            ];
        });
};
