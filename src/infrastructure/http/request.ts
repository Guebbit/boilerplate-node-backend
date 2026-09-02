/**
 * @module
 * Request input: a value may arrive as a route param, a query string or a JSON body field, and
 * the same endpoint often accepts more than one — which is what lets one controller serve `GET
 * /products?text=x` and `POST /products/search {text}` without duplicating the handler. This
 * module owns the *rules* of that polymorphism, behind one entry point, `readInput`, so
 * controllers don't re-assemble them.
 *
 * See: docs/theory/request-input.md
 */

import type { Request, Response } from 'express';
import type { AuthContext, Caller } from '@types';
// `ParamsDictionary` is Express' default type for `request.params` (a `Record<string, string>`).
// Naming it explicitly in generics keeps `request.params.id` typed instead of `any`.
// i18next translation function — messages are resolved against the request's locale, which the
// i18next middleware has already set up by the time a controller runs.
import { t } from '@infrastructure/i18n';
import { Types } from 'mongoose';
import { coerceStringArray } from '@guebbit/js-toolkit';
import { rejectResponse } from '@infrastructure/http/response';
import { stripUndefined } from '@infrastructure/persistence/fixtures';

/**
 * Read `request.body` as a plain object.
 *
 * Express 5 leaves `req.body` UNDEFINED when the request carries no body (express 4 defaulted it
 * to `{}`) — a body-less `DELETE /cart/:productId` otherwise threw and surfaced as a 500.
 */
const getRequestBody = (request: Request): Record<string, unknown> =>
    (request.body ?? {}) as Record<string, unknown>;

/**
 * True when the body arrived as `multipart/form-data`.
 *
 * The only body not already typed: a JSON body needs no coercion, and coercing it anyway would
 * swallow a contract violation (`!!'not-a-boolean'` is `true`). Express answers `null`, not
 * `false`, for no body at all — a distinction `!!` has to flatten here.
 */
const isMultipartRequest = (request: Request): boolean => !!request.is('multipart/form-data');

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

/**
 * Parse a string-transported value as a number.
 *
 * Same shape as `parseFormBoolean`: a multipart body carries no types, so `'101'` would fail a
 * `z.number()` schema. Anything not a finite number is returned untouched so the validator's own
 * message applies — and an empty string is left alone too, since `Number('')` is `0` and a blank
 * field means "not sent", never "zero".
 */
const parseFormNumber = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === '') return value;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
};

/** A repeated key arrives as an array; scalar fields take the first entry. */
const firstEntry = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** The three places a value can arrive from. Named so a route can declare which ones it reads. */
export type RequestInputSource = 'params' | 'body' | 'query';

/**
 * Which route surface is reading — a CLOSED set, so precedence is a property of the surface rather
 * than an ordering chosen by whoever wrote the newest controller. A fifth combination has to be
 * added deliberately, where it can be reviewed against the spec.
 *
 * See: docs/theory/request-input.md
 */
export type RequestSurface = 'search' | 'list' | 'write' | 'delete' | 'path';

/**
 * The sources each surface reads, HIGHEST precedence first — a CLOSED set, so precedence is a
 * property of the surface, not an ad hoc choice per controller.
 *
 * `search` reads body before query (unifies `POST .../search` and `GET ?text=`); `list` is
 * query-only (a GET has no body semantics per RFC 9110); `write` reads params before body;
 * `delete` reads params, query, then body, except `hardDelete` which is `anyTrue` and escapes
 * ranking; `path` is params-only, for a value that cannot arrive any other way.
 *
 * See: docs/theory/request-input.md
 */
const SURFACE_SOURCES: Record<RequestSurface, readonly RequestInputSource[]> = {
    search: ['body', 'query'],
    list: ['query'],
    write: ['params', 'body'],
    delete: ['params', 'query', 'body'],
    path: ['params']
};

/**
 * What a route reads, and how.
 *
 * `surface` is the whole precedence rule, named once per route instead of being implied by which
 * extraction helper the controller happened to reach for. The remaining keys do not add sources —
 * every key present in any source the surface reads ends up on the result regardless — they only
 * say how a few specific fields are resolved or decoded on the way in.
 */
export interface RequestInputDeclaration<TId extends string> {
    /** Which route surface this is, and therefore which sources it reads. */
    surface: RequestSurface;
    /** Scalar identifiers: a repeated key collapses to its first entry. */
    ids?: readonly TId[];
    /** Fields declared boolean by the contract — decoded on the string transports. */
    booleans?: readonly string[];
    /**
     * Fields resolved by OR across the sources instead of by precedence, decoded as booleans
     * without also being listed in `booleans`: any source `true` wins, an undecodable value is
     * passed through untouched, and otherwise it's `false` (absent if nothing stated one).
     *
     * For a flag whose default is `false` and rarely sent, a stated `true` is the only real
     * signal — ranking sources would let a default-shaped `false` outrank it. `hardDelete` is the
     * case this exists for.
     */
    anyTrue?: readonly string[];
    /** Fields declared numeric by the contract — decoded on the string transports. */
    numbers?: readonly string[];
    /** Fields declared `string[]` by the contract — decoded on the string transports. */
    stringArrays?: readonly string[];
}

/**
 * The result of a declaration. Everything is `unknown` — this layer decodes a transport, it does
 * not validate, and whatever it could not recognise has to reach the schema downstream intact.
 * Declared ids are the one exception, because their resolution rule already determines their type.
 */
export type RequestInput<TId extends string> = Record<string, unknown> &
    Partial<Record<TId, string>>;

/**
 * Read a route's input according to one declaration, so the multi-source rules aren't
 * re-assembled at every call site.
 *
 * Four rules: precedence is a `||` chain over the surface's sources, highest first; an explicit
 * `undefined` key is dropped rather than spread through as a Mongoose filter clause; absent stays
 * absent rather than defaulting to `false`/`[]`, so a partial update can't wipe what wasn't sent;
 * and only string transports (params, query, or a multipart body) get decoded — a JSON body keeps
 * its own types. `anyTrue` fields are the one exception: OR'd across sources, not ranked, because
 * a flag whose `false` is a default nobody typed has no honest precedence order.
 */
export const readInput = <TId extends string = never>(
    request: Request,
    declaration: RequestInputDeclaration<TId>
): RequestInput<TId> => {
    const anyTrue = declaration.anyTrue ?? [];
    // `anyTrue` fields are booleans too. Folded in here rather than asked of the caller twice,
    // because an `anyTrue` field left undecoded would never see the `true` a query string spells.
    const booleans = [...(declaration.booleans ?? []), ...anyTrue];
    const numbers = declaration.numbers ?? [];
    const stringArrays = declaration.stringArrays ?? [];
    const decodes = booleans.length > 0 || numbers.length > 0 || stringArrays.length > 0;

    /**
     * Decoding happens per source rather than on the merged result, because whether a value needs
     * it depends on where it came from: `?active=false` is always the string, `{"active": false}`
     * never is. Only fields actually present are touched — see the "absent is not empty" rule.
     */
    const decode = (values: Record<string, unknown>): Record<string, unknown> => {
        const decoded = { ...values };
        for (const key of booleans)
            if (key in decoded) decoded[key] = parseFormBoolean(decoded[key]);
        for (const key of numbers) if (key in decoded) decoded[key] = parseFormNumber(decoded[key]);
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
    const sources = SURFACE_SOURCES[declaration.surface].map((source) =>
        decodes && stringTransport[source] ? decode(values[source]) : values[source]
    );

    // Assigned lowest-precedence first, so higher ones overwrite. `Object.assign` copies keys
    // the same way a spread would — including `undefined` ones, removed by `stripUndefined`.
    const merged = Object.assign({}, ...sources.toReversed()) as Record<string, unknown>;
    const result: Record<string, unknown> = stripUndefined(merged);

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
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- stripping the caller-named key from a plain record is the whole job
        if (resolved === undefined) delete result[key];
        else result[key] = resolved;
    }

    // OR across the sources rather than a ranking of them.
    for (const key of anyTrue) {
        // Blank and null are "not stated", exactly as `hardDeleteSchema`'s own preprocess reads
        // them — otherwise `?hardDelete=` would outvote a body that said true.
        const stated = sources
            .map((source) => source[key])
            .filter((value) => value !== undefined && value !== null && value !== '');
        if (stated.length === 0) continue;
        // A value this layer could not decode is never outvoted: it reaches the schema and answers
        // 422, instead of a `true` somewhere else deciding on its behalf.
        const undecoded = stated.find((value) => typeof value !== 'boolean');
        result[key] = undecoded ?? stated.includes(true);
    }

    // The declared shape is what the loops above just built; a record cannot express it.
    return result as RequestInput<TId>;
};

/**
 * The caller on a route mounted behind `isAuth`.
 *
 * `Request.authContext` is optional on the global augmentation — absent until the auth middleware
 * resolves it — so this makes the "route is authenticated" claim ONCE, rather than each controller
 * re-checking, asserting with `!`, or branching on a ternary. A narrower request type isn't
 * available: Express' `RequestHandler` is contravariant, so asking for more than `Request` won't
 * mount. `tests/cross-cutting/authenticated-controllers.test.ts` asserts the other half — that the
 * route actually is behind `isAuth`.
 *
 * @param request - a request whose route mounts `isAuth`
 * @returns the resolved caller
 */
export const authContextOf = (request: { authContext?: AuthContext }): AuthContext =>
    request.authContext!;

/**
 * Everything a service needs to know about the request that reached it — who made it, where it
 * came from, what language it was made in — built once in the controller and passed down, because
 * the service tier is defined by never seeing a `Request`. Threaded rather than read off an
 * `AsyncLocalStorage` so a missing `CallerContext` is a compile error, not an ALS accessor
 * silently returning the wrong (or no) request across an async boundary.
 *
 * See: docs/tools/analytics.md#caller-context
 */
export interface CallerContext {
    /** The authenticated caller, or `{}` for anonymous — same shape authorization rules use. */
    caller: Caller;
    /** The caller's address, as Express resolved it (trust-proxy aware). */
    ip?: string;
    /** The `User-Agent` the caller sent, if any. */
    userAgent?: string;
    /** The `Host` header the caller sent, if any. */
    host?: string;
    /** The request id assigned by the request-id middleware, for correlating with the access log. */
    requestId?: string;
    /**
     * The language this request was made in, negotiated from `Accept-Language` — the FALLBACK for
     * copy addressed to someone whose own preference is unknown.
     *
     * On this interface, not a second parameter, because without it a service composing email
     * needed `request.locale` reached from the controller, pulling compose-and-enqueue logic up
     * out of services. Optional, and last in precedence: a stored preference is the better answer
     * wherever one exists.
     */
    locale?: string;
    /**
     * The caller's analytics consent choice — the stored `AuthContext.analyticsConsent`, else the
     * `X-Analytics-Consent` header the frontend forwards from the visitor's own banner choice.
     * `undefined` means "never asked" and captures nothing: `emitAnalyticsEvent`'s gate is opt-in,
     * and it is the only reader.
     */
    analyticsConsent?: 'granted' | 'denied';
}

/** The only two values `X-Analytics-Consent` may carry — anything else is treated as absent. */
const isConsentValue = (value: unknown): value is 'granted' | 'denied' =>
    value === 'granted' || value === 'denied';

/**
 * Build the `CallerContext` for the current request. Call once per controller, at the top, and
 * pass the result down to whichever service call ends up emitting.
 *
 * Structurally typed rather than `express.Request`, for the reason `authContextOf` gives: asking
 * for more than the minimum a helper reads is what breaks Express' contravariant handler typing.
 */
export const callerContextOf = (request: {
    authContext?: Caller & { analyticsConsent?: 'granted' | 'denied' };
    ip?: string;
    headers?: {
        'user-agent'?: string | string[];
        host?: string;
        'x-analytics-consent'?: string | string[];
    };
    requestId?: string;
    locale?: string;
}): CallerContext => {
    const rawUserAgent = request.headers?.['user-agent'];
    const rawConsentHeader = request.headers?.['x-analytics-consent'];
    const consentHeader = Array.isArray(rawConsentHeader) ? rawConsentHeader[0] : rawConsentHeader;
    return {
        caller: request.authContext ?? {},
        ip: request.ip,
        // Node exposes a repeated header as an array; take the first rather than logging
        // '[object Object]'-style noise.
        userAgent: Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent,
        host: request.headers?.host,
        requestId: request.requestId,
        // Absent until the locale middleware has run. Left absent rather than defaulted here: the
        // default belongs at the point of use, where `getDefaultLocale()` is the last term of a
        // precedence chain whose first term is the recipient's own stored preference.
        locale: request.locale,
        // The stored account preference wins over the header — but only when the account HAS one.
        // An authenticated caller who was never asked falls through to the header too, so a
        // banner choice made before logging in still counts until `PUT /account` records it.
        analyticsConsent:
            request.authContext?.analyticsConsent ??
            (isConsentValue(consentHeader) ? consentHeader : undefined)
    };
};

/**
 * Validate a MongoDB ObjectId from request params/body, answering 422 and returning `undefined`
 * when it doesn't validate.
 *
 * `surface` is a parameter, not a constant: a route reads ONE surface, and a delete controller
 * reading its id under `write` but `hardDelete` under `delete` would be reading one request two
 * ways — the property the closed `RequestSurface` set exists to guarantee.
 *
 * @param surface - the route's precedence rule, the same one its `readInput` call declares
 * @returns the validated id, or `undefined` when 422 has already been sent
 */
export const extractAndValidateId = (
    request: Request,
    response: Response,
    surface: RequestSurface = 'write'
): string | undefined => {
    // Route param first (`/products/:id`), then body — a param is the more explicit intent.
    const { id } = readInput(request, { surface, ids: ['id'] });
    // `Types.ObjectId.isValid` checks the format (24 hex chars / 12 bytes), not existence.
    if (!id || !Types.ObjectId.isValid(id)) {
        // 422 Unprocessable Entity: syntactically valid request, semantically unusable value.
        // Developer-oriented text in `message`, translated user-facing text in `errors`.
        rejectResponse(response, 422, [t('generic.error-missing-data')]);
        return undefined;
    }
    return id;
};

/**
 * Check if a value is a valid MongoDB ObjectId. Thin wrapper around Mongoose's `isValid` for
 * readability.
 *
 * The `id is string` return type makes this a type guard: `if (isValidObjectId(x))` narrows `x`
 * from `string | undefined` to `string`, removing the need for a non-null assertion downstream.
 */
export const isValidObjectId = (id: string | undefined): id is string =>
    !!id && Types.ObjectId.isValid(id);
