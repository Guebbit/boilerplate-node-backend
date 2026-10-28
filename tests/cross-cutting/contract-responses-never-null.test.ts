/**
 * No response schema in the bundled contract admits `null`.
 *
 * The read side of the empty-value rule (`docs/api/write-methods.md#empty-null-omitted`): `null` is
 * a write verb ("clear this", PUT/PATCH only). A response says "no value" by leaving the key out.
 * Request bodies keep their `'null'`; only what an operation answers is judged here.
 *
 * Schemas free-form by design (`additionalProperties: true`) cannot be judged from the contract:
 * `tests/support/response-contract.ts` walks every real response body for them.
 */

import { readSpec } from '@tests/spec-walk';

/** Anything the walk below needs to look inside: a schema node, an array of them, or a scalar. */
type Node = Record<string, unknown> | unknown[] | string | number | boolean | null | undefined;

/** The one `$ref` form the bundle uses: a JSON pointer into this same document. */
const resolveRef = (root: unknown, ref: string): Node => {
    let node: unknown = root;
    for (const key of ref.slice(2).split('/'))
        node = (node as Record<string, unknown>)[key.replaceAll('~1', '/').replaceAll('~0', '~')];
    return node as Node;
};

/** Whether a schema node is `type: 'null'` or lists `'null'` among its types. */
const admitsNull = (node: Record<string, unknown>): boolean => [node.type].flat().includes('null');

/**
 * Every place under `node` where a schema admits `null`, following `$ref`s once each.
 *
 * @param root - the whole document, for resolving refs
 * @param node - where to look
 * @param at - the path to `node`
 * @param seen - refs already followed, which also stops a self-referential schema
 */
const nullableSchemas = (root: unknown, node: Node, at: string, seen: Set<string>): string[] => {
    if (typeof node !== 'object' || node === null) return [];
    if (Array.isArray(node))
        return node.flatMap((child, index) =>
            nullableSchemas(root, child as Node, `${at}/${String(index)}`, seen)
        );

    const ref = node.$ref;
    if (typeof ref === 'string') {
        if (seen.has(ref)) return [];
        seen.add(ref);
        return nullableSchemas(root, resolveRef(root, ref), ref, seen);
    }

    return [
        ...(admitsNull(node) ? [at] : []),
        ...Object.entries(node).flatMap(([key, child]) =>
            nullableSchemas(root, child as Node, `${at}/${key}`, seen)
        )
    ];
};

/** Every nullable place reachable from any operation's responses, once each. */
const nullableInResponses = (): string[] => {
    const spec = readSpec();
    const seen = new Set<string>();

    return Object.entries(spec.paths).flatMap(([pathName, pathItem]) =>
        Object.entries(pathItem).flatMap(([method, operation]) =>
            typeof operation === 'object' && operation !== null && 'responses' in operation
                ? nullableSchemas(spec, operation.responses as Node, `${method} ${pathName}`, seen)
                : []
        )
    );
};

describe('contract responses never carry null', () => {
    it('admits null in no response schema', () => {
        expect(nullableInResponses()).toEqual([]);
    });

    it('still sees null in a request body, so the walk is not blind', () => {
        const spec = readSpec();
        const request = spec.components?.schemas?.UpdateInventoryLevelRequest;

        expect(
            nullableSchemas(spec, request as Node, 'UpdateInventoryLevelRequest', new Set())
        ).not.toEqual([]);
    });
});
