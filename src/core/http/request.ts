/**
 * Request parsing helpers.
 *
 * All of these exist to keep controllers free of input-shape trivia: a value may arrive as a
 * route param, a query string, or a JSON body field, and query values are always strings.
 */

import type { Request, Response } from 'express';
// `ParamsDictionary` is Express' default type for `request.params` (a `Record<string, string>`).
// Naming it explicitly in generics keeps `request.params.id` typed instead of `any`.
import type { ParamsDictionary } from 'express-serve-static-core';
// i18next translation function — messages are resolved against the request's locale, which the
// i18next middleware has already set up by the time a controller runs.
import { t } from '@core/i18n';
import { Types } from 'mongoose';
import { coerceStringArray } from '@guebbit/js-toolkit';
import { rejectResponse } from '@core/http/response';

/**
 * Read `request.body` as a plain object.
 *
 * Express 5 leaves `req.body` UNDEFINED when the request carries no body (express 4 defaulted it
 * to `{}`), so every reader has to cope with that — a body-less `DELETE /cart/:productId`, which
 * is exactly what the frontend sends, otherwise threw "Cannot read properties of undefined" and
 * surfaced as a 500. Every helper below goes through here so the guard exists once instead of
 * being remembered per call site.
 *
 * Typed as a `Record` rather than `any`: body values come off the wire and are `unknown` until
 * something validates them.
 */
const getRequestBody = (request: Request<ParamsDictionary>): Record<string, unknown> =>
    (request.body ?? {}) as Record<string, unknown>;

/**
 * Normalize pagination parameters from a pre-merged source object.
 * Falls back to NODE_SETTINGS_PAGINATION_PAGE_SIZE env var.
 *
 * Usage: extractPagination({ page: request.body.page ?? request.query.page, pageSize: ... })
 *
 * Returning `undefined` (rather than 1 / a default size) is deliberate: it lets the data layer
 * distinguish "client asked for page 1" from "client did not paginate at all".
 */
export const extractPagination = (
    parameters: { page?: string | number; pageSize?: string | number } = {}
): { page: number | undefined; pageSize: number | undefined } => {
    // Env fallback so page size is deployment-tunable without touching route code.
    const pageSizeRaw = parameters.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
    return {
        // Truthiness check, so '' and 0 both collapse to undefined ("not paginated") — and
        // `Number()` never gets a chance to turn '' into 0.
        page: parameters.page ? Number(parameters.page) : undefined,
        pageSize: pageSizeRaw ? Number(pageSizeRaw) : undefined
    };
};

/**
 * Pick the first defined non-empty value across multiple sources in priority order.
 * Usage: extractId(request.parameters.id, request.body.id, request.query.id)
 *
 * `Boolean` as the predicate skips undefined *and* empty strings — an empty `?id=` is not a
 * usable id, so it should fall through to the next source rather than win.
 * Argument order *is* the precedence order.
 */
export const extractId = (...candidates: (string | undefined)[]): string | undefined =>
    // Cast because `find` widens to `string | undefined` regardless of the predicate.
    candidates.find(Boolean) as string | undefined;

/**
 * Merge body and query into a single value, preferring body.
 * Reduces boilerplate in GET/search controllers.
 *
 * Lets one controller serve both `GET /search?name=x` and `POST /search {name:'x'}` — handy
 * when filter sets grow past what a URL comfortably holds.
 */
export const mergeBodyQuery = <T extends Record<string, unknown>>(
    body: Partial<T> | undefined,
    query: Partial<Record<keyof T, string>> | undefined
): Partial<T> => {
    const result: Partial<T> = {};
    // Body spread last, so its fields overwrite the query's on conflict.
    const merged = { ...query, ...body } as Partial<T>;
    // Second pass dropping explicit `undefined`: object spread *keeps* keys whose value is
    // undefined, and such a key handed to Mongoose would become a `field: undefined` filter
    // clause rather than being ignored.
    for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
    return result;
};

/**
 * Extract pagination from request body+query in one call.
 * Convenience wrapper combining mergeBodyQuery + extractPagination.
 *
 * The single call most list controllers need — body wins over query, per `mergeBodyQuery`.
 */
export const extractRequestPagination = (
    request: Request<ParamsDictionary>
): { page: number | undefined; pageSize: number | undefined } => {
    const merged = mergeBodyQuery(
        getRequestBody(request),
        request.query as Record<string, string> | undefined
    );
    return extractPagination({
        page: merged.page as string | undefined,
        pageSize: merged.pageSize as string | undefined
    });
};

/**
 * Validate a MongoDB ObjectId from request params/body.
 * Returns the id or sends a 422 response and returns undefined.
 *
 * Note this helper *responds on failure*, so the caller must bail out on `undefined` without
 * touching the response again:
 *   `const id = extractAndValidateId(...); if (!id) return;`
 *
 * Validating before querying matters: passing a malformed id to Mongoose throws a CastError
 * that would surface as an opaque 500 instead of a clear 422.
 *
 * @param entityLabel - used in the developer-facing message ('Product - missing id')
 */
export const extractAndValidateId = (
    request: Request<ParamsDictionary>,
    response: Response,
    entityLabel: string
): string | undefined => {
    // Route param first (`/products/:id`), then body — a param is the more explicit intent.
    const rawId =
        request.params.id ?? (getRequestBody(request).id as string | string[] | undefined);
    // A repeated query/body key arrives as an array; take the first rather than stringifying
    // the whole array into something that can never be a valid ObjectId.
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    // `Types.ObjectId.isValid` checks the format (24 hex chars / 12 bytes), not existence.
    if (!id || !Types.ObjectId.isValid(id)) {
        // 422 Unprocessable Entity: syntactically valid request, semantically unusable value.
        // Developer-oriented text in `message`, translated user-facing text in `errors`.
        rejectResponse(response, 422, `${entityLabel} - missing id`, [
            t('generic.error-missing-data')
        ]);
        return undefined;
    }
    return id;
};

/**
 * Extract an ID from explicit request fields (param or body).
 * Pure extraction only — no validation or response handling.
 *
 * For secondary identifiers whose field names differ per route (`userId`, `productId`, `token`),
 * where the fixed `id` convention of `extractAndValidateId` does not apply. Because it neither
 * validates nor responds, the caller owns both.
 *
 * @param fields - which param/body key to read, e.g. `{ param: 'userId', body: 'userId' }`
 */
export const extractCustomId = (
    request: Request,
    fields: { param?: string; body?: string } = {}
): string | undefined => {
    const fromParameters = fields.param ? request.params[fields.param] : undefined;
    const fromBody = fields.body ? getRequestBody(request)[fields.body] : undefined;
    // Delegates precedence to `extractId`: param before body, first truthy value wins.
    return extractId(
        Array.isArray(fromParameters) ? fromParameters[0] : (fromParameters as string | undefined),
        // Body values are `unknown` (JSON can hold anything), so coerce with String().
        Array.isArray(fromBody) ? String(fromBody[0]) : (fromBody as string | undefined)
    );
};

/**
 * Check if a value is a valid MongoDB ObjectId.
 * Thin wrapper around Mongoose's ObjectId.isValid for readability.
 *
 * The `id is string` return type makes this a *type guard*: after `if (isValidObjectId(x))`
 * TypeScript narrows `x` from `string | undefined` to `string`, removing the need for a
 * non-null assertion downstream.
 */
export const isValidObjectId = (id: string | undefined): id is string =>
    !!id && Types.ObjectId.isValid(id);

/**
 * True when the body arrived as `multipart/form-data`.
 *
 * The distinction matters because multipart carries every field as a *string*: a form's
 * `active=false` is the string 'false', and a repeated key is what stands in for an array.
 * A JSON body is already typed, so it needs no coercion — and coercing it anyway is how a
 * contract violation gets swallowed: `!!'not-a-boolean'` is `true`, so a wrong-typed JSON field
 * became a valid value before validation ever saw it, and the endpoint answered 201 where its
 * own contract promises 422. Callers therefore coerce only when this returns true.
 */
export const isMultipartRequest = (request: Request<ParamsDictionary>): boolean =>
    !!request.is('multipart/form-data');

/** Multipart spellings of a boolean, as HTML forms and common clients send them. */
const FORM_BOOLEANS: Record<string, boolean> = {
    true: true,
    '1': true,
    on: true,
    yes: true,
    false: false,
    '0': false,
    off: false,
    no: false
};

/**
 * Parse a multipart form value as a boolean.
 *
 * `!!value` cannot do this: `!!'false'` is `true`, so a form that unchecked a box still turned
 * the flag on. Anything not recognisable as a boolean is returned untouched (hence `unknown`)
 * so the validator downstream rejects it rather than this helper inventing a value for it.
 */
export const parseFormBoolean = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    return normalized in FORM_BOOLEANS ? FORM_BOOLEANS[normalized] : value;
};

/**
 * Read the fields whose type survives a JSON body but not a multipart one.
 *
 * A write controller says WHICH of its fields are booleans and which are string arrays; how
 * either is spelled on the wire is this module's business, not the controller's. Both write
 * controllers need exactly this, so the rule — and the reasoning behind it — lives here once.
 *
 * On a JSON body every value is returned untouched, because JSON already carries the type.
 * That is the whole point: decoding a JSON body would destroy the type error the validator
 * downstream has to see. Coercing unconditionally is what made `{"active": "not-a-boolean"}`
 * arrive at the validator as a perfectly good `true` and answer 201 where the contract
 * promises 422.
 *
 * Absent fields come back `undefined` rather than defaulted to `false`/`[]`: the service layer
 * only assigns fields that are defined, so defaulting here would turn a partial update into a
 * full overwrite and silently wipe whatever the caller did not mention.
 *
 * Values are `unknown` on purpose — this decodes a transport, it does not validate. Whatever it
 * could not recognise is passed through for the schema to reject.
 */
export const decodeFormFields = <K extends string>(
    request: Request<ParamsDictionary>,
    fields: { booleans?: readonly K[]; stringArrays?: readonly K[] }
): Partial<Record<K, unknown>> => {
    const body = getRequestBody(request);
    const multipart = isMultipartRequest(request);
    const decoded: Partial<Record<K, unknown>> = {};

    // An absent field is never decoded, on either transport. `coerceStringArray(undefined)`
    // returns `[]`, which reads as "the caller sent an empty list" — and the service layer,
    // which skips undefined but assigns `[]`, would clear the stored value on a partial update.
    const decode = (key: K, coerce: (value: unknown) => unknown) => {
        const raw = body[key];
        decoded[key] = raw === undefined || !multipart ? raw : coerce(raw);
    };

    for (const key of fields.booleans ?? []) decode(key, parseFormBoolean);
    for (const key of fields.stringArrays ?? []) decode(key, coerceStringArray);

    return decoded;
};

/**
 * Extract the hardDelete flag from query, params, or body.
 * Used by delete controllers that support soft/hard delete.
 *
 * Soft delete (flag the document) is the default; hard delete (actually remove it) must be
 * asked for. Note the loose truthiness: `?hardDelete=false` is the *string* 'false', which is
 * truthy — so any present, non-empty value enables it. Callers should treat presence, not
 * value, as the switch.
 */
export const extractHardDelete = (request: Request<ParamsDictionary>): boolean =>
    // `??` chain, so an explicitly-false body value is not overridden by an absent query param.
    !!(request.query.hardDelete ?? request.params.hardDelete ?? getRequestBody(request).hardDelete);
