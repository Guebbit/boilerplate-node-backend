/**
 * @module
 * An `enum` a fragment declares by NAME and the bundler fills from a list that lives elsewhere.
 *
 * Use it when the allowed values are already written down somewhere a contract file cannot
 * `$ref` into: the webhook events are the channel names of every module's `asyncapi.webhooks.yaml`,
 * and copying them into `webhooks/openapi.yaml` would drift the day a module adds one.
 *
 * Mark the schema, never write the values:
 *
 * ```yaml
 * WebhookEventFilter:
 *     type: string
 *     x-enum-from: webhook-events   # a key of the sources the bundler passes in
 *     x-enum-also: ['*']            # optional: values appended after the source's own
 * ```
 *
 * Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`. A new
 * source is one more entry in the object `openapi-bundle.ts` hands to {@link withFilledEnums};
 * a new use of an existing one is two lines in a fragment. Nothing here knows any source by name.
 *
 * See: docs/api/contract-fragmentation.md
 */

import type { OpenApiDocument } from './openapi-document';

/** The lists the bundler can fill from, by the name a fragment's `x-enum-from` gives. */
export type EnumSources = Readonly<Record<string, readonly string[]>>;

/** A schema node carrying the placeholder, as far as this step reads and writes it. */
interface Placeholder {
    'x-enum-from'?: unknown;
    'x-enum-also'?: unknown;
    enum?: unknown;
}

/** Narrows the optional appended values to a list of strings. */
const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * The enum one placeholder asks for.
 *
 * @param node - the schema node carrying `x-enum-from`
 * @param sources - every list the bundler can fill from
 * @param where - the node's location, for the error message
 * @throws Error if the source is unknown or empty, the appended list is malformed, or the node
 *   already has an `enum` of its own (a second, silent source of truth)
 */
const enumFor = (node: Placeholder, sources: EnumSources, where: string): string[] => {
    const name = node['x-enum-from'];
    if (typeof name !== 'string' || !Object.hasOwn(sources, name))
        throw new Error(
            `[openapi] ${where}: x-enum-from names no known source (${String(name)}); known: ${Object.keys(sources).join(', ')}.`
        );
    if (node.enum !== undefined)
        throw new Error(
            `[openapi] ${where}: x-enum-from and a hand-written enum cannot both stand.`
        );
    const also = node['x-enum-also'] ?? [];
    if (!isStringList(also))
        throw new Error(`[openapi] ${where}: x-enum-also must be a list of strings.`);

    const values = [...sources[name], ...also];
    if (sources[name].length === 0)
        throw new Error(
            `[openapi] ${where}: the source ${name} is empty, so its enum would be too.`
        );
    if (new Set(values).size !== values.length)
        throw new Error(`[openapi] ${where}: ${name} and x-enum-also name the same value twice.`);
    return values;
};

/**
 * Fill every placeholder in `value`, in place, depth first.
 *
 * @param value - any parsed YAML node
 * @param sources - every list the bundler can fill from
 * @param where - the node's JSON-pointer-ish location
 * @returns how many placeholders were filled
 */
const fillIn = (value: unknown, sources: EnumSources, where: string): number => {
    if (typeof value !== 'object' || value === null) return 0;
    let filled = 0;

    if (!Array.isArray(value) && 'x-enum-from' in value) {
        const node = value as Placeholder;
        node.enum = enumFor(node, sources, where);
        // Instructions to this step, not part of the published contract.
        delete node['x-enum-from'];
        delete node['x-enum-also'];
        filled += 1;
    }

    for (const [key, child] of Object.entries(value))
        filled += fillIn(child, sources, `${where}/${key}`);
    return filled;
};

/**
 * Fill every `x-enum-from` schema in the document with its source's values.
 *
 * @param document_ - the bundled OpenAPI document
 * @param sources - every list the bundler can fill from, by name
 * @throws Error if a placeholder names an unknown or empty source, or conflicts with an `enum`
 */
export const withFilledEnums = (document_: OpenApiDocument, sources: EnumSources): void => {
    fillIn(document_, sources, '#');
};
