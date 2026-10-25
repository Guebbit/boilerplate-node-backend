/**
 * @module
 * Response envelope.
 *
 * A success answers with the `{ success, status, message, data }` envelope. A failure answers with
 * RFC 9457 problem details (`application/problem+json`) whose `errors` extension carries the
 * machine codes. Internally both outcomes stay one `ServiceResult` union discriminated on
 * `success`; only `rejectResponse` turns a rejection into a problem.
 *
 * See: docs/api/errors.md
 */

import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import type { ZodError } from 'zod';
// Type-only: this file sits on `contracts:bundle`'s own incidental module-load path (it loads a
// scenario, which loads `access`, which reaches this for every response), and that step runs
// BEFORE `gen:api` produces `@api/error-codes` — a value import here would make a fresh
// `npm run regenerate` unable to take its own second step. `satisfies ErrorCode` below still gets
// the compiler's check, just at `ts-check` time, by which point the file exists.
import type { ErrorCode } from '@api/error-codes';
import { t } from '@infrastructure/i18n';

/** Fields shared by both internal outcomes — the discriminant plus human/machine status. */
export interface ResponseNeutral {
    /** The discriminant. `true` → read `data`; `false` → read `errors`. */
    success: boolean;
    /** Mirrors the HTTP status in the body, which survives proxies that rewrite status codes. */
    status: number;
    /** Human-readable summary. A success's is optional (often ''); a rejection's is its problem `title`. */
    message: string;
}

/**
 * The envelope shape for a successful response — `success: true` with a payload and no errors.
 */
export interface ResponseSuccess<T> extends ResponseNeutral {
    /** The literal (not `boolean`) is what lets TypeScript narrow `ServiceResult<T>` on this field alone. */
    success: true;
    /** Generic payload — the endpoint's actual result. Always present; a service with nothing to return passes `undefined` as `T`. */
    data: T;
    /** Forbids constructing a success envelope that also carries errors — a check `success: true` alone cannot make. */
    errors: never;
}

/** One machine-readable failure. Endpoints can return several (e.g. per-field validation). */
export interface ResponseErrorItem {
    /**
     * Stable code for client logic — clients must branch on this, never on `message`. Typed
     * against the generated catalogue so a typo or a removed code fails at compile time;
     * the contract's own `code: string` stays open-ended, since {@link ErrorCode} is a union of
     * KNOWN codes, not an exhaustive `enum` — see `api/error-codes.ts`.
     */
    code: ErrorCode;
    /** Human-readable, translatable text safe to show a user. */
    message: string;
    /** Optional structured context (offending field, constraint, limit, ...). */
    details?: Record<string, unknown>;
}

/**
 * The envelope shape for a failed response — `success: false` with no payload and at least one
 * structured error.
 */
export interface ResponseReject extends ResponseNeutral {
    /** The literal (not `boolean`) is what lets TypeScript narrow `ServiceResult<T>` on this field alone. */
    success: false;
    // explicit undefined keeps `result.data` union-safe
    // (the key is present, so `result.data` type-checks on both branches of the union
    // instead of erroring as a missing property).
    data: undefined;
    // structured errors for machines and UIs
    errors: ResponseErrorItem[];
}

/**
 * Build the canonical success envelope so every endpoint speaks the same response dialect.
 *
 * Split from `successResponse` so the envelope can be built without an Express `Response` —
 * useful in unit tests, and in workers that produce the same shape outside HTTP.
 */
export const generateSuccess = <T>(data: T, status = 200, message = '') =>
    ({
        success: true,
        status,
        message,
        data
        // `as` cast is required because `errors: never` cannot be satisfied by any literal:
        // the field is deliberately absent at runtime and exists only to drive narrowing.
    }) as ResponseSuccess<T>;

/**
 * Serialize the success envelope immediately when a controller is done with its work.
 *
 * `status` is applied twice on purpose — to the HTTP response and inside the body — so the two
 * can never disagree.
 *
 * @param response - Express response
 * @param data - payload
 * @param status - HTTP status (200 by default; pass 201 for creations)
 */
export const successResponse = <T>(response: Response, data: T, status = 200, message = '') =>
    // `.json()` sets Content-Type and ends the response; the cast just types the return value
    // so controllers can `return successResponse(...)` and keep their signature accurate.
    response.status(status).json(generateSuccess(data, status, message)) as Response<
        ResponseSuccess<T>
    >;

/**
 * A create's answer: 201, the envelope, and `Location` naming the new resource.
 *
 * RFC 9110 §9.3.3: a POST that creates SHOULD send `Location`, and §15.3.2 reads a 201 without one
 * as "the resource is the target URI", which for `POST /products` would name the collection.
 *
 * @param response - Express response
 * @param data - payload, the created resource
 * @param location - the new resource's path on this API, e.g. `/products/abc`
 * @param message - optional envelope message
 */
export const createdResponse = <T>(response: Response, data: T, location: string, message = '') => {
    // Express: sets the `Location` header, URL-encoding it; it never follows it.
    // https://expressjs.com/en/api.html#res.location
    response.location(location);
    return successResponse(response, data, 201, message);
};

/**
 * The answer of a write that may or may not create: {@link createdResponse} when `status` is 201,
 * otherwise {@link successResponse} with that status.
 *
 * @param response - Express response
 * @param data - payload
 * @param status - what the service answered; 201 only when this call created the resource, unset is 200
 * @param location - the new resource's path, sent only on a 201
 * @param message - optional envelope message
 */
export const createdOrOk = <T>(
    response: Response,
    data: T,
    status: number | undefined,
    location: string,
    message = ''
) =>
    status === 201
        ? createdResponse(response, data, location, message)
        : successResponse(response, data, status, message);

/** One status's wording: its stable code and the key of its translated text. */
interface StatusEnvelope {
    /** Machine code; absent where the status shares the generic one. */
    code?: ErrorCode;
    /** The `generic.*` locale key the status-only `errors[0].message` is translated from. */
    messageKey: string;
}

/**
 * Every status the envelope names, with the code and the translated text it answers with.
 *
 * One list, so adding 402 or 423 cannot reach the text and miss the code. An absent `code` is
 * deliberate: 422 and 429 get the generic code, because a client branches on "the request was
 * wrong", not on which flavour of wrong.
 */
const STATUS_ENVELOPE: Readonly<Partial<Record<number, StatusEnvelope>>> = {
    400: { code: 'BAD_REQUEST', messageKey: 'generic.error-bad-request' },
    401: { code: 'UNAUTHORIZED', messageKey: 'generic.error-unauthorized' },
    403: { code: 'FORBIDDEN', messageKey: 'generic.error-forbidden' },
    404: { code: 'NOT_FOUND', messageKey: 'generic.error-nothing-found' },
    405: { code: 'METHOD_NOT_ALLOWED', messageKey: 'generic.error-method-not-allowed' },
    409: { code: 'CONFLICT', messageKey: 'generic.error-conflict' },
    412: { code: 'PRECONDITION_FAILED', messageKey: 'generic.error-precondition-failed' },
    422: { messageKey: 'generic.error-invalid-data' },
    429: { messageKey: 'generic.error-rate-limited' }
};

/** What every 5xx answers with. One code: the flavour would leak internals. */
const SERVER_FAULT = {
    code: 'INTERNAL_ERROR',
    messageKey: 'generic.error-internal'
} as const satisfies StatusEnvelope;

/** What an unmapped 4xx answers with. */
const UNMAPPED_REQUEST_FAULT = {
    code: 'REQUEST_ERROR',
    messageKey: 'generic.error-unknown'
} as const satisfies StatusEnvelope;

/**
 * The two statuses whose RFC 9110 name is newer than Node's `STATUS_CODES`, which still carries the
 * names from RFC 7231 (413 "Payload Too Large", 422 "Unprocessable Entity").
 */
const CURRENT_STATUS_TITLES: Readonly<Partial<Record<number, string>>> = {
    413: 'Content Too Large',
    422: 'Unprocessable Content'
};

/**
 * Maps HTTP status codes to stable machine-readable error codes.
 *
 * @param status - HTTP status code
 * @returns a code from the generated catalogue
 */
const resolveErrorCode = (status: number): ErrorCode => {
    if (status >= 500) return SERVER_FAULT.code;
    // An entry with no `code` of its own is the deliberate asymmetry above, not a gap.
    return STATUS_ENVELOPE[status]?.code ?? UNMAPPED_REQUEST_FAULT.code;
};

/**
 * The problem's `title`: the English RFC 9110 status phrase, one per status and nothing else, so
 * there is exactly one wording per status and no handler name leaks into a 404. Stays English on
 * purpose — it names the status class (RFC 9457 §3.1.3); the translated text is `detail`.
 *
 * @param status - HTTP status code
 * @returns the status phrase, or its class name for a status Node has no phrase for
 */
export const resolveErrorTitle = (status: number): string => {
    // Typed `string` by @types/node, but a status Node has no name for is `undefined`.
    const nodePhrase: string | undefined = STATUS_CODES[status];
    return (
        CURRENT_STATUS_TITLES[status] ??
        nodePhrase ??
        (status >= 500 ? 'Server Error' : 'Client Error')
    );
};

/**
 * The translated text of a status-only failure, in the request's language.
 *
 * @param status - HTTP status code
 * @returns the `generic.*` copy for that status
 */
const resolveErrorText = (status: number): string =>
    t(
        (status >= 500 ? SERVER_FAULT : (STATUS_ENVELOPE[status] ?? UNMAPPED_REQUEST_FAULT))
            .messageKey
    );

/**
 * Normalizes mixed error inputs into the structured API error item shape.
 *
 * Callers may pass plain strings (the common case: a translated message) or fully-formed
 * items. Accepting both keeps call sites terse while guaranteeing the response always
 * carries `{ code, message }` pairs.
 *
 * @param status - used to derive both a code and the (translated) fallback text when none was supplied
 * @param errors - strings and/or structured items, possibly empty
 * @returns a non-empty array of structured items
 */
const normalizeErrors = (
    status: number,
    errors: (string | ResponseErrorItem)[]
): ResponseErrorItem[] => {
    const fallbackMessage = resolveErrorText(status);
    // Guarantee at least one item: a failure response with `errors: []` would force every
    // client to special-case it.
    const inputErrors = errors.length > 0 ? errors : [fallbackMessage];

    return inputErrors.map((error) => {
        // Shorthand form: derive the code from the status.
        if (typeof error === 'string') {
            return {
                code: resolveErrorCode(status),
                message: error
            };
        }

        // Structured form: honour what the caller set, fill the gaps.
        return {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `ErrorCode` has no empty-string member, but `error` crossed a call boundary the type system cannot enforce (a caller building one dynamically); this is the fallback for that case, not dead code.
            code: error.code || resolveErrorCode(status),
            message: error.message || fallbackMessage,
            // Conditional spread so `details` is omitted entirely rather than serialized as
            // `"details": undefined`-shaped noise.
            ...(error.details ? { details: error.details } : {})
        };
    });
};

/**
 * Build the reject envelope. Counterpart to `generateSuccess`, separated from the send step so it
 * can be asserted on directly in tests. Defaults to 400 — the most common client error, and a
 * safer accidental default than 500. No `message` parameter on purpose (see
 * {@link resolveErrorTitle}) — `errors` is the half the client is meant to read.
 */
export const generateReject = (status = 400, errors: (string | ResponseErrorItem)[] = []) =>
    ({
        success: false,
        status,
        message: resolveErrorTitle(status),
        // Explicitly present-but-undefined; see `ResponseReject.data`.
        data: undefined,
        errors: normalizeErrors(status, errors)
    }) as ResponseReject;

/**
 * The wait, in seconds, a refusal's first `details.retryAfter` names — `undefined` when none does.
 *
 * @param rejection - the envelope about to be sent
 */
const retryAfterOf = (rejection: ResponseReject): number | undefined =>
    rejection.errors
        .map((item) => item.details?.retryAfter)
        .find((value): value is number => typeof value === 'number');

/** The media type of every error body (RFC 9457 §6.1). */
const PROBLEM_MEDIA_TYPE = 'application/problem+json';

/**
 * A rough hint, not a promise — how long a client should wait before retrying a 503. There is no
 * backoff state to read this from (an infra outage's real duration is unknown), so one constant
 * for every 503 is honest about that, rather than inventing a number that looks computed.
 * RFC 9110 §10.2.3.
 */
const SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * An error body: RFC 9457 problem details plus the `errors` extension that carries the machine
 * codes. A response can hold several codes, so there is no top-level `code`.
 */
export interface ProblemDetails {
    /** Always `about:blank` (RFC 9457 §4.2.1): the machine key is `errors[].code`, not a type URI. */
    type: 'about:blank';
    /** The English status phrase — see {@link resolveErrorTitle}. */
    title: string;
    /** The HTTP status, repeated in the body so it survives a proxy that rewrites the status line. */
    status: number;
    /** The translated sentence a user may read: the one error's message, or the status's generic text. */
    detail: string;
    /** `urn:uuid:<request id>` — names this occurrence in a support ticket; never the URL. */
    instance?: string;
    /** One item per failure; never empty. */
    errors: ResponseErrorItem[];
}

/** What `x-request-id` must look like to name an occurrence: the id the request middleware mints. */
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * The problem's `instance`: the request id as a URN, absent when no id was minted (a unit test, or
 * an error before the request-id middleware).
 *
 * @param response - the response whose `x-request-id` header names the occurrence
 */
const instanceOf = (response: Response): string | undefined => {
    const requestId = response.getHeader('x-request-id');
    return typeof requestId === 'string' && UUID_PATTERN.test(requestId)
        ? `urn:uuid:${requestId}`
        : undefined;
};

/**
 * Turn an internal rejection into the body that goes on the wire.
 *
 * @param rejection - the envelope {@link generateReject} built
 * @param instance - the occurrence id, when there is one
 */
const problemOf = (rejection: ResponseReject, instance: string | undefined): ProblemDetails => ({
    type: 'about:blank',
    title: rejection.message,
    status: rejection.status,
    // One item says it all; several are summarised by the status's own text, the items carry the rest.
    detail:
        rejection.errors.length === 1
            ? rejection.errors[0].message
            : resolveErrorText(rejection.status),
    ...(instance ? { instance } : {}),
    errors: rejection.errors
});

/**
 * Send a normalized error payload instead of leaking framework-specific response shapes.
 *
 * The single exit point for failures: RFC 9457 problem details, always `application/problem+json`
 * whatever `Accept` says (RFC 9110 §12.5.1 allows ignoring it). Notably it does *not* throw, so
 * controllers must `return rejectResponse(...)` — forgetting the `return` would let execution
 * continue and trigger Express' "headers already sent" error.
 */
export const rejectResponse = (
    response: Response,
    status = 400,
    errors: (string | ResponseErrorItem)[] = []
) => {
    const rejection = generateReject(status, errors);
    const retryAfter = retryAfterOf(rejection);
    // `Retry-After` is the header form of what `details.retryAfter` already says (RFC 9110 §10.2.3).
    if (status === 429 && retryAfter !== undefined)
        response.setHeader('Retry-After', String(retryAfter));
    // A 503 carries a wait hint too (RFC 9110 §15.6.4); a guard that knows better sets it first.
    if (status === 503 && !response.hasHeader('Retry-After'))
        response.setHeader('Retry-After', String(SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS));
    // A 401 MUST carry a challenge (RFC 9110 §15.5.2, §11.6.1): the default says which scheme the
    // API takes. A guard that names a more specific one (`error="invalid_token"`) sets it first.
    if (status === 401 && !response.hasHeader('WWW-Authenticate'))
        response.setHeader('WWW-Authenticate', 'Bearer realm="api"');
    // Set before `.json()`, which only defaults the type when none is set: an export route's
    // earlier `text/csv` would otherwise leak onto its own error. An error is never an attachment.
    response.setHeader('Content-Type', PROBLEM_MEDIA_TYPE);
    response.removeHeader('Content-Disposition');
    return response
        .status(status)
        .json(problemOf(rejection, instanceOf(response))) as Response<ProblemDetails>;
};

/**
 * The error item for a refusal about one request field: `details.field` names it.
 *
 * The contract's rule is "a refusal about one field names it", whatever its code, so a client puts
 * the message under that input instead of in a banner.
 *
 * @param field - the request field, dotted like a Zod path (`shippingAddress.zip`)
 * @param message - the translated text
 * @param code - the error code; `VALIDATION_ERROR` unless the refusal has a domain code of its own
 * @param extra - more structured context, beside `field` (a limit, the offending values)
 * @returns one error item
 */
export const fieldError = (
    field: string,
    message: string,
    code: ErrorCode = 'VALIDATION_ERROR',
    extra: Record<string, unknown> = {}
): ResponseErrorItem => ({ code, message, details: { ...extra, field } });

/**
 * Turn a Zod failure into the contract's error list, keeping the field that failed.
 *
 * Lives beside `ResponseErrorItem` rather than in `./controller`, because four SERVICES import it
 * too and nothing here knows about a `Response`. `path` is joined with dots (`shippingAddress.zip`)
 * so a client can tell WHICH field a 422 is about without string-matching the copy; an issue with
 * no path — a whole-body refinement — carries no `details` rather than an empty one.
 *
 * @param error - the `ZodError` from a failed `safeParse`
 * @returns one error item per issue, each naming its field
 */
export const validationErrors = (error: ZodError): ResponseErrorItem[] =>
    error.issues.map((issue) => {
        const field = issue.path.join('.');
        return field
            ? fieldError(field, issue.message)
            : { code: 'VALIDATION_ERROR', message: issue.message };
    });
