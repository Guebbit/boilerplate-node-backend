/**
 * @module
 * A malformed id: one answer per position, in one place.
 *
 * Where the id sits decides the answer:
 *
 * | The id is in…                  | Malformed (`abc`)                                  |
 * | ------------------------------ | -------------------------------------------------- |
 * | the URL path                   | 404, the same answer as a well-formed unknown id   |
 * | a body field or a query filter | 422 `VALIDATION_ERROR`, `details.field` = the field |
 *
 * "Malformed" means not this backend's own id: 24 hex characters. The contract's shared `Id` is
 * deliberately looser (a storage-neutral bound, no ObjectId regex), so a value can pass it and
 * still land here.
 *
 * See: docs/theory/request-flow.md#a-malformed-id-has-one-answer-per-position
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { t } from '@infrastructure/i18n';
import { isPlainObject } from '@infrastructure/object-guards';
import { readInput, type RequestSurface } from '@infrastructure/http/request';
import { rejectResponse, type ResponseErrorItem } from '@infrastructure/http/response';

/**
 * The one spelling of an id this API issues: 24 hex characters.
 * Mongoose's own `isValid` also accepts any 12-character string (a 12-byte binary form), which no
 * route ever hands out, so it is not the check here.
 */
const OBJECT_ID_PATTERN = /^[\da-f]{24}$/i;

/**
 * The contract's shared `Id` pattern, as the generated Zod schemas carry it. It is how a request
 * schema's id fields are recognised: a string field with this regex IS an `Id`.
 * `tests/cross-cutting/contract-scalars.test.ts` proves it still equals `openapi.yaml`'s.
 */
export const CONTRACT_ID_PATTERN = '^[0-9A-Za-z_-]+$';

/**
 * Check if a value is a well-formed MongoDB ObjectId string: exactly 24 hex characters.
 *
 * The `id is string` return type makes this a type guard: `if (isValidObjectId(x))` narrows `x`
 * to `string`, removing the need for a non-null assertion downstream. Anything that is not a
 * string is not an id, however it prints.
 *
 * @param id - the candidate, as the request carried it
 */
export const isValidObjectId = (id: unknown): id is string =>
    typeof id === 'string' && OBJECT_ID_PATTERN.test(id);

/**
 * The 422 error item for one id field that is missing or malformed.
 *
 * @param field - the request field, dotted like every other validation issue (`items.0.productId`)
 * @param value - what the request carried; `undefined` reads as "missing", anything else as "malformed"
 */
const fieldIdIssue = (field: string, value: unknown): ResponseErrorItem => ({
    code: 'VALIDATION_ERROR',
    message: t(value === undefined ? 'validation.required' : 'validation.invalid-format'),
    details: { field }
});

/** What {@link requireId} needs to know about the id it reads. */
export interface RequiredId {
    /**
     * What the module answers an unknown id with, so a malformed one is indistinguishable from it:
     * an i18n key; a function that builds the translated copy, where it names the id or the
     * entity; or `null` where an unknown id answers the bare 404 envelope.
     */
    notFound: string | (() => string) | null;
    /** The param or field the id travels under. Default `id`. */
    name?: string;
    /** The route's precedence rule, the same one its other `readInput` calls declare. Default `path`. */
    surface?: RequestSurface;
}

/**
 * The error list a path-id 404 carries.
 *
 * @param notFound - {@link RequiredId.notFound}
 */
const notFoundCopy = (notFound: RequiredId['notFound']): string[] => {
    if (notFound === null) return [];
    return [typeof notFound === 'function' ? notFound() : t(notFound)];
};

/**
 * Read the one id a route is about and refuse the request when it is not an id.
 *
 * Position decides the refusal: an id that arrived as a path param is a resource that does not
 * exist (404 with the module's own not-found copy, so nothing tells it from an unknown id); one
 * that arrived in a body or query is a bad argument (422 naming the field).
 *
 * @param request - the incoming request
 * @param response - the express response, used only on failure
 * @param id - which id to read and what a refusal answers
 * @returns the id, or `undefined` when the refusal has already been sent
 */
export const requireId = (
    request: Request,
    response: Response,
    { notFound, name = 'id', surface = 'path' }: RequiredId
): string | undefined => {
    const value: unknown = readInput(request, { surface, ids: [name] })[name];
    if (isValidObjectId(value)) return value;

    // A matched route template is the only way `request.params` holds `name`: the URL named it.
    if (Object.hasOwn(request.params, name)) rejectResponse(response, 404, notFoundCopy(notFound));
    else rejectResponse(response, 422, [fieldIdIssue(name, value)]);
    return undefined;
};

/**
 * The slice of a Zod schema this module reads. Zod keeps these on `_zod.def`, which its own
 * library docs name as the supported hook for tooling that walks a schema.
 * https://zod.dev/library-authors
 */
interface SchemaNode {
    _zod: {
        def: {
            type: string;
            shape?: Record<string, SchemaNode>;
            element?: SchemaNode;
            innerType?: SchemaNode;
            in?: SchemaNode;
            out?: SchemaNode;
            options?: SchemaNode[];
            left?: SchemaNode;
            right?: SchemaNode;
            checks?: { _zod: { def: { check: string; pattern?: RegExp } } }[];
        };
    };
}

/**
 * Whether a value is a Zod schema this module can read. The check is deliberately shallow: every
 * Zod 4 schema carries `_zod.def`, and the walk below reads only keys it tests for itself.
 *
 * @param value - anything a caller handed in as a schema
 */
const isSchemaNode = (value: unknown): value is SchemaNode =>
    typeof value === 'object' && value !== null && '_zod' in value;

/** Where a schema holds an id: the keys down to it, `'*'` for "every element of this array". */
type IdPath = readonly string[];

/** Wrappers that change nothing about the value's shape: the id lives one level down. */
const TRANSPARENT = new Set([
    'optional',
    'nullable',
    'default',
    'prefault',
    'nonoptional',
    'readonly'
]);

/**
 * Whether a string schema is the contract's `Id`: it carries the shared pattern.
 *
 * @param node - a schema node of type `string`
 */
const isIdString = (node: SchemaNode): boolean =>
    (node._zod.def.checks ?? []).some(
        (check) =>
            check._zod.def.check === 'string_format' &&
            check._zod.def.pattern?.source === CONTRACT_ID_PATTERN
    );

/**
 * Every place a schema holds an id, depth first.
 *
 * @param node - the schema, or the part of it being walked
 * @param prefix - the keys walked to reach `node`
 */
const collectIdPaths = (node: SchemaNode, prefix: IdPath): IdPath[] => {
    const { def } = node._zod;

    if (def.type === 'string') return isIdString(node) ? [prefix] : [];
    if (def.type === 'object')
        return Object.entries(def.shape ?? {}).flatMap(([key, field]) =>
            collectIdPaths(field, [...prefix, key])
        );
    if (def.type === 'array' && def.element) return collectIdPaths(def.element, [...prefix, '*']);
    if (TRANSPARENT.has(def.type) && def.innerType) return collectIdPaths(def.innerType, prefix);
    // A pipe (`z.preprocess`, `.transform`) reads on one side and produces on the other.
    if (def.type === 'pipe')
        return [def.in, def.out].flatMap((side) => (side ? collectIdPaths(side, prefix) : []));
    if (def.type === 'union') return (def.options ?? []).flatMap((o) => collectIdPaths(o, prefix));
    if (def.type === 'intersection')
        return [def.left, def.right].flatMap((side) => (side ? collectIdPaths(side, prefix) : []));
    return [];
};

/** Id paths per schema, so a controller's schema is walked once, not once per request. */
const idPathsBySchema = new WeakMap<object, IdPath[]>();

/**
 * Where a request schema holds ids.
 *
 * @param schema - a generated request schema (body or query)
 */
const idPathsOf = (schema: ZodType): IdPath[] => {
    let paths = idPathsBySchema.get(schema);
    if (!paths) {
        paths = isSchemaNode(schema) ? collectIdPaths(schema, []) : [];
        idPathsBySchema.set(schema, paths);
    }
    return paths;
};

/** One id the request actually carries: the dotted field it sits in, and its value. */
interface CarriedId {
    field: string;
    value: unknown;
}

/**
 * The ids a request carries at one schema path, with the concrete field each sits in.
 *
 * @param value - the request input at this depth
 * @param path - the rest of the schema path
 * @param prefix - the dotted keys walked so far
 */
const carriedAt = (value: unknown, path: IdPath, prefix: readonly string[]): CarriedId[] => {
    if (path.length === 0) return [{ field: prefix.join('.'), value }];

    const [head, ...rest] = path;
    if (head === '*')
        return Array.isArray(value)
            ? value.flatMap((entry: unknown, index) =>
                  carriedAt(entry, rest, [...prefix, String(index)])
              )
            : [];
    return isPlainObject(value) && head in value
        ? carriedAt(value[head], rest, [...prefix, head])
        : [];
};

/**
 * The 422 items for every id field of `input` that is a string but not this backend's id.
 *
 * Only strings are judged: a missing or mistyped field is the schema's own finding, and reporting
 * it twice would put two items on one field.
 *
 * @param schema - the schema `input` is validated against; it says which fields are ids
 * @param input - the raw request input, before the schema transformed it
 * @param flagged - fields the schema already refused, which are not reported again
 * @returns one `VALIDATION_ERROR` item per malformed id, each naming its field
 */
export const malformedIdIssues = (
    schema: ZodType,
    input: unknown,
    flagged: ReadonlySet<string> = new Set()
): ResponseErrorItem[] =>
    idPathsOf(schema)
        .flatMap((path) => carriedAt(input, path, []))
        .filter(
            ({ field, value }) =>
                typeof value === 'string' && !isValidObjectId(value) && !flagged.has(field)
        )
        .map(({ field, value }) => fieldIdIssue(field, value));
