/**
 * Response envelope.
 *
 * Every endpoint answers with the same top-level shape, so clients can branch on `success`
 * without knowing which route they called — and so the generated API client (orval) has a
 * single discriminated union to model.
 */

import type { Response } from 'express';

/** Fields shared by both outcomes — the discriminant plus human/machine status. */
export interface ResponseNeutral {
    /** The discriminant. `true` → read `data`; `false` → read `errors`. */
    success: boolean;
    /** Mirrors the HTTP status in the body, which survives proxies that rewrite status codes. */
    status: number;
    /** Human-readable summary. Optional in practice (often ''). */
    message: string;
}

export interface ResponseSuccess<T> extends ResponseNeutral {
    // message: "ok"
    /** Generic payload — the endpoint's actual result. */
    data?: T;
    /**
     * `never` is intentional: it makes success and reject mutually exclusive at type level,
     * so TypeScript narrows the union from a single `success` check and forbids constructing
     * a success envelope that also carries errors.
     */
    errors: never;
}

/** One machine-readable failure. Endpoints can return several (e.g. per-field validation). */
export interface ResponseErrorItem {
    /** Stable code for client logic — clients must branch on this, never on `message`. */
    code: string;
    /** Human-readable, translatable text safe to show a user. */
    message: string;
    /** Optional structured context (offending field, constraint, limit, ...). */
    details?: Record<string, unknown>;
}

export interface ResponseReject extends ResponseNeutral {
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
 * Every status the envelope names, with the code and the message it answers with.
 *
 * One list, so adding 402 or 423 cannot reach the message and miss the code. An absent `code` is
 * deliberate: 422 and 429 get a reason phrase and the generic code, because a client branches on
 * "the request was wrong", not on which flavour of wrong.
 */
const STATUS_ENVELOPE: Readonly<Partial<Record<number, { code?: string; message: string }>>> = {
    400: { code: 'BAD_REQUEST', message: 'Bad Request' },
    401: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    403: { code: 'FORBIDDEN', message: 'Forbidden' },
    404: { code: 'NOT_FOUND', message: 'Not Found' },
    409: { code: 'CONFLICT', message: 'Conflict' },
    422: { message: 'Unprocessable Entity' },
    429: { message: 'Too Many Requests' }
};

/** What every 5xx answers with. One code and one phrase: the flavour would leak internals. */
const SERVER_FAULT = { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } as const;

/** What an unmapped 4xx answers with. */
const UNMAPPED_REQUEST_FAULT = { code: 'REQUEST_ERROR', message: 'Request Error' } as const;

/**
 * Maps HTTP status codes to stable machine-readable error codes.
 *
 * @param status - HTTP status code
 * @returns an uppercase, stable code string
 */
const resolveErrorCode = (status: number): string => {
    if (status >= 500) return SERVER_FAULT.code;
    // An entry with no `code` of its own is the deliberate asymmetry above, not a gap.
    return STATUS_ENVELOPE[status]?.code ?? UNMAPPED_REQUEST_FAULT.code;
};

/**
 * The envelope's `message`, DERIVED from the status and nothing else — callers cannot supply one,
 * so there is exactly one wording per status and no handler name leaks into a 404.
 *
 * `message` is developer-facing; the translated, user-facing text is `errors[]`.
 *
 * @param status - HTTP status code
 * @returns the canonical reason phrase for that status
 */
export const resolveErrorMessage = (status: number): string => {
    if (status >= 500) return SERVER_FAULT.message;
    return STATUS_ENVELOPE[status]?.message ?? UNMAPPED_REQUEST_FAULT.message;
};

/**
 * Normalizes mixed error inputs into the structured API error item shape.
 *
 * Callers may pass plain strings (the common case: a translated message) or fully-formed
 * items. Accepting both keeps call sites terse while guaranteeing the response always
 * carries `{ code, message }` pairs.
 *
 * @param status - used to derive both a code and the fallback text when none was supplied
 * @param errors - strings and/or structured items, possibly empty
 * @returns a non-empty array of structured items
 */
const normalizeErrors = (
    status: number,
    errors: (string | ResponseErrorItem)[]
): ResponseErrorItem[] => {
    const fallbackMessage = resolveErrorMessage(status);
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
            code: error.code || resolveErrorCode(status),
            message: error.message || fallbackMessage,
            // Conditional spread so `details` is omitted entirely rather than serialized as
            // `"details": undefined`-shaped noise.
            ...(error.details ? { details: error.details } : {})
        };
    });
};

/**
 * Build the reject envelope. Counterpart to `generateSuccess` — separated from the send step
 * so it can be asserted on directly in tests.
 *
 * Defaults to 400: the most common client-error status, and a safer accidental default than 500.
 *
 * There is no `message` parameter on purpose — see {@link resolveErrorMessage}. `errors` is where
 * a caller says something specific, and it is the half the client is meant to read.
 */
export const generateReject = (status = 400, errors: (string | ResponseErrorItem)[] = []) =>
    ({
        success: false,
        status,
        message: resolveErrorMessage(status),
        // Explicitly present-but-undefined; see `ResponseReject.data`.
        data: undefined,
        errors: normalizeErrors(status, errors)
    }) as ResponseReject;

/**
 * Send a normalized error payload instead of leaking framework-specific response shapes.
 *
 * The single exit point for failures. Notably it does *not* throw, so controllers must
 * `return rejectResponse(...)` — forgetting the `return` would let execution continue and
 * trigger Express' "headers already sent" error.
 */
export const rejectResponse = (
    response: Response,
    status = 400,
    errors: (string | ResponseErrorItem)[] = []
) => response.status(status).json(generateReject(status, errors)) as Response<ResponseReject>;
