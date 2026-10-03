/**
 * Where `openapi.yaml` puts an id: the places a request can carry one, found by the shared `Id`
 * schema's pattern rather than by a hand-kept list.
 *
 * `malformed-ids.test.ts` walks these to prove the one-answer-per-position rule on every route the
 * spec declares, including ones added after this file was written.
 */
import { CONTRACT_ID_PATTERN } from '@infrastructure/http/ids';
import type { Operation, SchemaNode } from './spec-walk';

/** One step down a body: an object key, or `0` for the first element of an array. */
export type Segment = string | number;

/** Whether a resolved schema node is the contract's shared `Id`. */
export const isContractId = (node: SchemaNode | undefined): boolean =>
    node?.pattern === CONTRACT_ID_PATTERN;

/**
 * Every id-typed field of a resolved request schema, as the keys down to it.
 *
 * @param node - a resolved body or query schema
 * @param prefix - the keys walked so far
 */
export const idFieldsOf = (node: SchemaNode | undefined, prefix: Segment[] = []): Segment[][] => {
    if (!node) return [];
    if (isContractId(node)) return [prefix];

    const variants = [...(node.oneOf ?? []), ...(node.anyOf ?? [])];
    return [
        ...Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
            idFieldsOf(child, [...prefix, key])
        ),
        ...idFieldsOf(node.items, [...prefix, 0]),
        ...variants.flatMap((variant) => idFieldsOf(variant, prefix))
    ];
};

/** The path parameters of an operation that are ids. */
export const idPathParameters = (operation: Operation): string[] =>
    operation.pathParameters.filter((name) => isContractId(operation.pathParameterSchemas[name]));

/** The query parameters of an operation that carry ids, as the keys down into each. */
export const idQueryFields = (operation: Operation): Segment[][] =>
    operation.queryParameters.flatMap((parameter) =>
        idFieldsOf(parameter.schema, [parameter.name])
    );

/** The JSON body fields of an operation that carry ids, as the keys down into each. */
export const idBodyFields = (operation: Operation): Segment[][] => idFieldsOf(operation.bodySchema);

/**
 * The dotted field name a 422 reports for a path of segments — `items.0.productId`.
 *
 * @param segments - the keys down to the field
 */
export const fieldName = (segments: readonly Segment[]): string => segments.join('.');

/**
 * Write `value` at `segments` of `target`, creating the objects and arrays on the way.
 *
 * @param target - the body being edited
 * @param segments - the keys down to the field; a number means an array slot
 * @param value - what to put there
 */
export const setPath = (target: unknown, segments: readonly Segment[], value: unknown): void => {
    let cursor = target as Record<Segment, unknown>;
    for (const [index, segment] of segments.entries()) {
        if (index === segments.length - 1) {
            cursor[segment] = value;
            return;
        }
        const next = cursor[segment];
        cursor[segment] =
            typeof next === 'object' && next !== null
                ? next
                : typeof segments[index + 1] === 'number'
                  ? []
                  : {};
        cursor = cursor[segment] as Record<Segment, unknown>;
    }
};
