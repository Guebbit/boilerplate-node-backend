/**
 * Narrowing a service's response envelope in a test, without an inline cast per assertion.
 *
 * A service returns `ResponseSuccess<T> | ResponseReject`, so `response.data` does not type-check
 * until the union is narrowed. Doing that with `as` at the call site says nothing when it is
 * wrong: the cast succeeds, the assertion below reads a property of the other arm, and the failure
 * arrives as `undefined` rather than as "it rejected". These assert the arm FIRST, so a response
 * that took the wrong branch fails on that fact, on its own line, before anything reads it.
 */

import type { ResponseReject, ResponseSuccess } from '@infrastructure/http/response';

/** Narrow to the reject arm, failing the test (rather than the type check) when it succeeded. */
export const asReject = <T>(response: ResponseSuccess<T> | ResponseReject): ResponseReject => {
    expect(response.success).toBe(false);
    return response as ResponseReject;
};

/** Narrow to the success arm, and to a present `data` — the reject arm declares it `undefined`. */
export const asSuccess = <T>(
    response: ResponseSuccess<T> | ResponseReject
): ResponseSuccess<T> & { data: T } => {
    expect(response.success).toBe(true);
    return response as ResponseSuccess<T> & { data: T };
};
