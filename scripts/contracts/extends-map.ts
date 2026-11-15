/**
 * @module
 * The `x-extends` map of a fragment, read the same way for OpenAPI and AsyncAPI.
 *
 * `x-extends: { <Schema>: [<value or schema name>, ...] }` is the one shape both formats accept.
 * Reading it in one place means a malformed map, a repeated name or an undeclared variant is
 * refused identically on both sides, never dropped on one and thrown on the other.
 *
 * @see docs/build/contract-fragmentation.md#extending-another-modules-contract
 */

import { isPlainObject } from '../../src/infrastructure/object-guards';

/** Narrows a map value to a list of strings. */
const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Reads a fragment's `x-extends` value into a schema-name to list map.
 *
 * @param declared - the parsed `x-extends` value
 * @param where - the fragment's label for the message, e.g. `[openapi] /path/file.yaml`
 * @returns the map, every list non-empty and free of repeats
 * @throws Error if it is not a map of string lists, or a list is empty or names a value twice
 */
export const parseExtendsMap = (declared: unknown, where: string): Record<string, string[]> => {
    if (!isPlainObject(declared))
        throw new Error(`${where}: x-extends must be a map of string lists.`);
    const parsed: Record<string, string[]> = {};
    for (const [name, list] of Object.entries(declared)) {
        if (!isStringList(list))
            throw new Error(`${where}: x-extends ${name} must be a list of strings.`);
        if (list.length === 0) throw new Error(`${where}: x-extends ${name} is an empty list.`);
        if (new Set(list).size !== list.length)
            throw new Error(`${where}: x-extends ${name} names the same entry twice.`);
        parsed[name] = list;
    }
    return parsed;
};

/**
 * Refuses a variant the fragment does not declare among its own schemas.
 *
 * @param names - the schema names a union is to gain
 * @param declared - the schemas the fragment declares
 * @param where - the fragment's label for the message
 * @throws Error naming the first undeclared variant
 */
export const requireDeclared = (
    names: readonly string[],
    declared: Readonly<Record<string, unknown>>,
    where: string
): void => {
    for (const name of names)
        if (!Object.hasOwn(declared, name))
            throw new Error(
                `${where}: variant ${name} is not declared in the fragment's components.`
            );
};
