/**
 * Request input.
 *
 * A value an endpoint needs may arrive as a route param, a query string or a JSON body field, and
 * the same endpoint often accepts more than one of those — that is what lets one controller serve
 * `GET /products?text=x` and `POST /products/search {text}` without duplicating the handler.
 *
 * This module owns the *rules* of that polymorphism so controllers don't re-assemble them. There
 * is one entry point, `readInput`, which takes a route's declaration and returns its input;
 * `docs/theory/request-input.md` holds the resulting endpoint × parameter table and the known
 * places where it and `openapi.yaml` disagree.
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
 * surfaced as a 500.
 *
 * Typed as a `Record` rather than `any`: body values come off the wire and are `unknown` until
 * something validates them.
 */
const getRequestBody = (request: Request<ParamsDictionary>): Record<string, unknown> =>
    (request.body ?? {}) as Record<string, unknown>;

/**
 * True when the body arrived as `multipart/form-data`.
 *
 * This is the only question worth asking about a *body*, because it is the only body that is not
 * already typed. A JSON body needs no coercion — and coercing it anyway is how a contract
 * violation gets swallowed: `!!'not-a-boolean'` is `true`, so a wrong-typed JSON field became a
 * valid value before validation ever saw it, and the endpoint answered 201 where its own contract
 * promises 422.
 *
 * Note express answers `null`, not `false`, for a request with no body at all — a distinction
 * `!!` has to flatten, or a body-less request would be treated as a form.
 */
const isMultipartRequest = (request: Request<ParamsDictionary>): boolean =>
    !!request.is('multipart/form-data');

/** String spellings of a boolean, as URLs, HTML forms and common clients send them. */
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
 * Parse a string-transported value as a boolean.
 *
 * `!!value` cannot do this: `!!'false'` is `true`, so a form that unchecked a box still turned
 * the flag on, and `?hardDelete=false` permanently deleted the record. Anything not recognisable
 * as a boolean is returned untouched (hence `unknown`) so the validator downstream rejects it
 * rather than this helper inventing a value for it.
 */
const parseFormBoolean = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    return normalized in FORM_BOOLEANS ? FORM_BOOLEANS[normalized] : value;
};

/** A repeated key arrives as an array; scalar fields take the first entry. */
const firstEntry = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** The three places a value can arrive from. Named so a route can declare which ones it reads. */
export type RequestInputSource = 'params' | 'body' | 'query';

/**
 * What a route reads, and how.
 *
 * `sources` is the whole precedence rule, written once per route instead of being implied by
 * which extraction helper the controller happened to reach for. The remaining keys do not add
 * sources — every key present in any declared source ends up on the result regardless — they
 * only say how a few specific fields are resolved or decoded on the way in.
 */
export interface IRequestInputDeclaration<Id extends string> {
    /** Which sources this route reads, HIGHEST precedence first. */
    sources: readonly RequestInputSource[];
    /** Scalar identifiers: a repeated key collapses to its first entry. */
    ids?: readonly Id[];
    /** Fields declared boolean by the contract — decoded on the string transports. */
    booleans?: readonly string[];
    /** Fields declared `string[]` by the contract — decoded on the string transports. */
    stringArrays?: readonly string[];
}

/**
 * The result of a declaration. Everything is `unknown` — this layer decodes a transport, it does
 * not validate, and whatever it could not recognise has to reach the schema downstream intact.
 * Declared ids are the one exception, because their resolution rule already determines their type.
 */
export type IRequestInput<Id extends string> = Record<string, unknown> & {
    [K in Id]?: string;
};

/**
 * Read a route's input according to one declaration.
 *
 * What this replaces is re-assembling the rules of the multi-source polymorphism at every call
 * site, which is how `hardDelete` ended up reading three sources while `id` read two, each in an
 * order nothing recorded, and how a new endpoint got it wrong by copying whichever neighbouring
 * controller its author opened first.
 *
 * Four rules, previously spread across five separate helpers:
 *
 * - **Precedence is a `||` chain over `sources`**, highest first, so an empty value falls through
 *   as if the key were absent.
 * - **Explicit `undefined` keys are dropped.** An object spread *keeps* them, and such a key
 *   handed to Mongoose becomes a `field: undefined` filter clause rather than being ignored.
 * - **Absent is not empty.** A field nobody sent stays absent, never `false` or `[]`: the service
 *   layer assigns anything defined, so defaulting here would turn a partial update into a full
 *   overwrite and wipe whatever the caller did not mention.
 * - **Only the string transports are decoded.** A route param and a query entry are strings by
 *   construction — there is no type in them to destroy — so a declared boolean or string array
 *   coming from either is always decoded. A body is decoded only when it is multipart, because a
 *   JSON body carries its own types and coercing it is what swallows a contract violation.
 */
export const readInput = <Id extends string = never>(
    request: Request<ParamsDictionary>,
    declaration: IRequestInputDeclaration<Id>
): IRequestInput<Id> => {
    const booleans = declaration.booleans ?? [];
    const stringArrays = declaration.stringArrays ?? [];
    const decodes = booleans.length > 0 || stringArrays.length > 0;

    /**
     * Decoding happens per source rather than on the merged result, because whether a value needs
     * it depends on where it came from: `?active=false` is always the string, `{"active": false}`
     * never is. Only fields actually present are touched — see the "absent is not empty" rule.
     */
    const decode = (values: Record<string, unknown>): Record<string, unknown> => {
        const decoded = { ...values };
        for (const key of booleans)
            if (key in decoded) decoded[key] = parseFormBoolean(decoded[key]);
        for (const key of stringArrays)
            if (key in decoded) decoded[key] = coerceStringArray(decoded[key]);
        return decoded;
    };

    // The content type is inspected only when the declaration has something to decode, so a route
    // that declares neither never asks.
    const stringTransport: Record<RequestInputSource, boolean> = {
        params: true,
        query: true,
        body: decodes && isMultipartRequest(request)
    };
    const values: Record<RequestInputSource, Record<string, unknown>> = {
        params: request.params,
        body: getRequestBody(request),
        query: request.query as Record<string, unknown>
    };
    const sources = declaration.sources.map((source) =>
        decodes && stringTransport[source] ? decode(values[source]) : values[source]
    );

    // Assigned lowest-precedence first, so the higher ones overwrite. `Object.assign` copies own
    // keys the same way a spread does — including keys whose value is `undefined`, which the
    // second pass below then removes.
    const merged: Record<string, unknown> = Object.assign({}, ...sources.toReversed());
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) if (value !== undefined) result[key] = value;

    // A `||` chain across the sources: the first non-empty value wins, and a source carrying an
    // empty string is only used if nothing better follows.
    for (const key of declaration.ids ?? []) {
        let resolved: unknown;
        for (const source of sources) {
            const value = firstEntry(source[key]);
            if (value) {
                resolved = value;
                break;
            }
            if (value !== undefined) resolved ??= value;
        }
        if (resolved === undefined) delete result[key];
        else result[key] = resolved;
    }

    // The declared shape is what the loops above just built; a record cannot express it.
    return result as IRequestInput<Id>;
};

/**
 * Validate a MongoDB ObjectId from request params/body.
 * Returns the id or sends a 422 response and returns undefined.
 *
 * Kept separate from `readInput` because it *responds* as well as extracts, which is a different
 * job. The caller must therefore bail out on `undefined` without touching the response again:
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
    const { id } = readInput(request, { sources: ['params', 'body'], ids: ['id'] });
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
 * Check if a value is a valid MongoDB ObjectId.
 * Thin wrapper around Mongoose's ObjectId.isValid for readability.
 *
 * The `id is string` return type makes this a *type guard*: after `if (isValidObjectId(x))`
 * TypeScript narrows `x` from `string | undefined` to `string`, removing the need for a
 * non-null assertion downstream. That narrowing is what earns it its own line at the cart call
 * sites, where `readInput` hands over a `string | undefined` that Mongo still has to accept.
 */
export const isValidObjectId = (id: string | undefined): id is string =>
    !!id && Types.ObjectId.isValid(id);
