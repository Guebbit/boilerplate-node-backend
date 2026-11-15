/**
 * @module
 * `Idempotency-Key` middleware: makes a retried write safe. Mounted per route, the way
 * `uploadLimiter` is — never globally, since a GET needs no replay protection and a route that is
 * already idempotent by construction (a provider callback keyed on its own reference, a
 * reservation keyed on a domain key, and so on) should not pay for a second mechanism.
 *
 * Opt-in at the header level on most routes: a caller who sends no `Idempotency-Key` gets no
 * protection and no refusal. A do-not-retry operation (one where a repeat moves money or stock
 * twice) uses `requireIdempotencyKey` and refuses a missing key with 400. Past the lease, such a key
 * is never run again: it answers a stored 409 "outcome unknown" and tells staff.
 *
 * The record lives in Mongo, not Redis: `docker-compose.yml` runs the cache with
 * `--maxmemory-policy allkeys-lru`, which can evict a live record under memory pressure and turn
 * an evicted entry into a silent duplicate write at exactly the moment the system is under load.
 * An idempotency ledger is a source of truth, so it goes in Mongo next to every other durable
 * thing that expires on a TTL — see `idempotency-model.ts`.
 *
 * The ledger never sees a 429: every budget refuses before the key is claimed, and a handler must
 * not answer 429 after a write.
 *
 * See: docs/understand/idempotency.md
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { canonicalize } from '@guebbit/js-toolkit';
import { markDoNotRetry, rejectResponse } from '@infrastructure/http/response';
import { keepEtag } from '@infrastructure/http/preconditions';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { logger } from '@infrastructure/adapters/logger';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { t } from '@infrastructure/i18n';
import {
    idempotencyRecordModel,
    type IdempotencyRecordDocument
} from '@infrastructure/http/middlewares/idempotency-model';
import { ERROR_CODES } from '@api/error-codes';
import { MINUTE_MS } from '@domain-primitives/time';
import { settleWithin } from '@infrastructure/runtime/settle';

/** The header this middleware reads. Express lower-cases header names on `request.header()`. */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * What a legal key looks like, in either form; group 1 is the quoted inner value, group 2 the bare
 * one. Length and character class only, per the contract parameter
 * (`shared/contracts/openapi.root.yaml#/components/parameters/IdempotencyKeyHeader`) — a UUID
 * happens to match, but nothing requires one.
 *
 * Both forms because the draft (§2.1) defines the value as a Structured Field String, quoted
 * (RFC 9651 §3.3.3), while Stripe-style clients send it bare. RFC 9651 §2.2 lets a field narrow a
 * String's format, so the inner value is limited to this class and no `\` escapes exist.
 * https://www.ietf.org/archive/id/draft-ietf-httpapi-idempotency-key-header-08.txt
 */
const KEY_PATTERN = /^(?:"([\w-]{1,200})"|([\w-]{1,200}))$/;

/**
 * Whether `value`, or anything nested inside it, carries an OWN `__proto__` key. A JSON body
 * genuinely can: `JSON.parse` creates one as an ordinary data property, never the prototype
 * itself (ES2019+, verified against the Node version this runs on) — `Object.hasOwn` sees it,
 * `Object.getPrototypeOf` is unaffected. `canonicalize` (`@guebbit/js-toolkit` 2.2.0) does not
 * preserve that: its accumulator is a plain object literal, so `result['__proto__'] = value`
 * invokes the property's SETTER instead of creating a key, and the key silently vanishes from the
 * fingerprint — two request bodies differing only in `__proto__` then hash identically. Reported
 * upstream (https://github.com/Guebbit/js-toolkit); refused here until fixed, since silently
 * mis-fingerprinting is worse than refusing a body no legitimate client sends anyway.
 *
 * @param value - the value to scan — `request.body`, or a nested object/array reached from it
 */
const hasPrototypeKey = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some((entry) => hasPrototypeKey(entry));
    if (value === null || typeof value !== 'object') return false;
    if (Object.hasOwn(value, '__proto__')) return true;
    return Object.values(value).some((entry) => hasPrototypeKey(entry));
};

/**
 * What this request IS, independent of who is asking: the method, the concrete path and the body.
 * Two requests with the same key but a different fingerprint are the client reusing a key for a
 * different request, which is a client bug this middleware exists to catch rather than paper over.
 *
 * The concrete path, not the route template: `/order/A/refund` and `/order/B/refund` carry the
 * same (empty) body, so a template fingerprint would replay A's answer for B and never refund B.
 *
 * Keyed, never a bare hash: the body of `POST /signup` carries the plaintext password, and this
 * lands in Mongo for the retention window. A bare `sha256` of it would let anyone with a dump
 * guess passwords at hash speed and skip the hash cost entirely.
 *
 * @param request - the incoming request, already matched to its route
 */
const fingerprintOf = (request: Request): string => {
    /*
     * js-toolkit: rebuilds the body with every object's keys sorted, recursively, so the SAME
     * body with its fields in a different order fingerprints identically. `JSON.stringify` of the
     * result is the stable string — a `sort` replacer would only order the top level.
     * https://github.com/Guebbit/js-toolkit
     */
    const body = JSON.stringify(canonicalize(request.body ?? {}));

    return pseudonymise(
        'idempotency',
        `${request.method} ${request.baseUrl}${request.path}\n${body}`
    );
};

/**
 * Who is asking, for the `(key, caller)` composite the unique index enforces — an authenticated
 * caller's account id, or the address for a public route with no account to name. Scoping by
 * caller is what stops one person from reading another's cached reply merely by guessing or
 * observing their key.
 *
 * @param request - the incoming request
 */
const callerKeyOf = (request: Request): string =>
    request.caller?.id ?? `ip:${request.ip ?? 'unknown'}`;

/** Everything the outcomes below need out of a stored record. */
type StoredRecord = Pick<
    IdempotencyRecordDocument,
    | 'state'
    | 'fingerprint'
    | 'status'
    | 'body'
    | 'location'
    | 'contentType'
    | 'headers'
    | 'createdAt'
    | 'updatedAt'
>;

/**
 * What a do-not-retry route names about itself, once, where it mounts the key: the operation staff
 * will read about, and which path parameter holds the thing it acts on.
 */
export interface DoNotRetrySubject {
    /** A short stable name for the operation (`refund`, `ship`); the sink maps it to words. */
    operation: string;
    /** The route parameter that carries the subject's id (`id`, `productId`). */
    subjectParam: string;
}

/**
 * The facts of a do-not-retry key whose first attempt never reported an outcome, handed to the
 * registered {@link OutcomeUnknownSink}.
 */
export interface OutcomeUnknownFacts extends DoNotRetrySubject {
    /** The shop the caller acted in. */
    tenantId: string;
    /** The id the route's `subjectParam` held. */
    subjectId: string;
    /** When the first attempt began: the ledger record's creation. */
    since: Date;
    /** One value per stuck ledger record, so a second takeover of it is told once. */
    recordId: string;
}

/**
 * Where an outcome-unknown notice goes. A port, like `AuditSink`: `infrastructure` cannot import
 * the module that writes the notice, so that module registers itself from its `onRegistered`.
 * Implementations MUST NOT throw and MUST NOT reject: the 409 is already being answered.
 */
export type OutcomeUnknownSink = (facts: OutcomeUnknownFacts) => void;

/** The registered sink, if any; unregistered (unit tests, a project without a shop) is supported. */
let outcomeUnknownSink: OutcomeUnknownSink | undefined;

/**
 * Install the sink that tells staff a do-not-retry key's outcome is unknown.
 *
 * @param sink - fire-and-forget: no awaiting, no throwing
 */
export const registerOutcomeUnknownSink = (sink: OutcomeUnknownSink): void => {
    outcomeUnknownSink = sink;
};

/**
 * Everything one request knows when it claims, taken or lost, a key: the three identity parts of
 * the record, and the do-not-retry facts when its route is one.
 */
interface Claim {
    /** The caller-supplied key, unquoted. */
    key: string;
    /** See {@link callerKeyOf}. */
    caller: string;
    /** See {@link fingerprintOf}. */
    fingerprint: string;
    /** Present on a do-not-retry route; `tenantId` is absent when no shop could be named. */
    doNotRetry?: DoNotRetryFacts;
}

/** What a do-not-retry request adds to its {@link Claim}. */
type DoNotRetryFacts = DoNotRetrySubject & { subjectId: string; tenantId?: string };

/** Every done-mark write started and not yet finished: what {@link settleIdempotencyMarks} waits for. */
const pendingMarks = new Set<Promise<void>>();

/**
 * Wait for every done-mark already started, up to `timeoutMs`. The mark is written after the
 * answer has gone out, so a process stopped right then would strand the key `in_flight` and, on a
 * do-not-retry route, turn a client's retry into a false "outcome unknown".
 *
 * @param timeoutMs - the most it may wait
 */
export const settleIdempotencyMarks = (timeoutMs: number): Promise<void> =>
    settleWithin(pendingMarks, timeoutMs);

/**
 * The headers an answer carries that a retry must see too: the challenge of a 401, the allowed
 * methods of a 405, the `ETag` of a write that answers its row's new tag and the `Content-Location`
 * it belongs to. Without them a replayed refusal is a bare status, and a replayed write hands back
 * no tag.
 *
 * `Retry-After` is left out: a stored 503 must not say "retry later" for the whole retention
 * window, under a key that can never succeed.
 */
const REPLAYED_HEADERS = ['WWW-Authenticate', 'Allow', 'ETag', 'Content-Location'] as const;

/**
 * The replayable headers the handler set on this response, by name.
 *
 * @param response - the response about to be sent
 */
const replayedHeadersOf = (response: Response): Record<string, string> =>
    Object.fromEntries(
        REPLAYED_HEADERS.flatMap((name) => {
            const value = response.getHeader(name);
            return value === undefined ? [] : [[name, value.toString()]];
        })
    );

/**
 * How long an 'in_flight' record holds its key. Past this, the attempt that claimed it is taken
 * to be dead (a crash, a killed process) and a retry may claim the key again: an ordinary key runs
 * the handler again, a do-not-retry key answers "outcome unknown" and runs nothing. Without it, a
 * crash mid-request answers 409 to every retry for the whole retention window.
 *
 * Far above any real handler: a live request running this long is already past every timeout.
 */
const IN_FLIGHT_LEASE_MS = 5 * MINUTE_MS;

/**
 * Whether an 'in_flight' record outlived {@link IN_FLIGHT_LEASE_MS}. It says the lease ran out,
 * not that the attempt is dead: a live but slow one is rare, and a do-not-retry key treats it as
 * unknown rather than as free.
 *
 * @param existing - the record holding the key
 */
const isAbandoned = (existing: StoredRecord): boolean =>
    existing.state === 'in_flight' &&
    existing.updatedAt !== undefined &&
    Date.now() - existing.updatedAt.getTime() > IN_FLIGHT_LEASE_MS;

/**
 * Answer a do-not-retry key whose lease ran out: 409 "outcome unknown", stored so every later
 * retry replays it, and staff told once. The handler never runs: the first attempt may have taken
 * effect, and running it again could move the money or the stock a second time.
 *
 * @param claim - the key being taken over
 * @param doNotRetry - the claim's do-not-retry facts
 * @param existing - the abandoned record, for the first attempt's time
 */
const answerOutcomeUnknown = (
    claim: Claim,
    doNotRetry: DoNotRetryFacts,
    existing: StoredRecord,
    response: Response
): Response => {
    armOutcomeCapture(response, claim);
    tellStaffOutcomeUnknown(claim, doNotRetry, existing);
    return rejectResponse(response, 409, [
        {
            code: ERROR_CODES.IDEMPOTENCY_OUTCOME_UNKNOWN,
            message: t('generic.error-idempotency-outcome-unknown')
        }
    ]);
};

/**
 * Hand the stuck key to the registered sink. Fire-and-forget: a notice that cannot be raised is
 * logged at `error` and the 409 still goes out; the client's own re-read is the safety net.
 *
 * @param claim - the key being taken over
 * @param doNotRetry - the claim's do-not-retry facts
 * @param existing - the abandoned record
 */
const tellStaffOutcomeUnknown = (
    claim: Claim,
    doNotRetry: DoNotRetryFacts,
    existing: StoredRecord
): void => {
    const { tenantId, ...subject } = doNotRetry;
    const sink = outcomeUnknownSink;
    if (tenantId === undefined || !sink) {
        logger.error({
            message: 'A do-not-retry key has an unknown outcome and no one could be told.',
            operation: subject.operation,
            subjectId: subject.subjectId
        });
        return;
    }
    // A promise chain, not a bare call: a sink that throws synchronously, against its contract,
    // must still not fail the 409 that is being answered.
    Promise.resolve()
        .then(() =>
            sink({
                ...subject,
                tenantId,
                since: existing.createdAt ?? new Date(),
                recordId: `${claim.caller}:${claim.key}`
            })
        )
        .catch((error: unknown) => {
            logger.error({
                message: 'A do-not-retry outcome-unknown notice could not be raised.',
                operation: subject.operation,
                error
            });
        });
};

/**
 * Take over an abandoned 'in_flight' record, atomically: the filter pins the `updatedAt` this
 * request saw, so of two retries racing for the same dead record exactly one wins. On an ordinary
 * key the winner runs the handler with its answer captured; on a do-not-retry key it answers
 * "outcome unknown" instead (see {@link answerOutcomeUnknown}). The loser answers 409, as for any
 * live attempt.
 *
 * @param claim - the key being taken over
 * @param existing - the abandoned record — see {@link isAbandoned}
 */
const reclaimAbandoned = (
    claim: Claim,
    existing: StoredRecord,
    response: Response,
    next: NextFunction
): Promise<void> =>
    idempotencyRecordModel
        .updateOne(
            {
                key: claim.key,
                caller: claim.caller,
                state: 'in_flight',
                updatedAt: existing.updatedAt
            },
            // `timestamps: true` restamps `updatedAt`, which restarts the lease for this attempt.
            { $set: { state: 'in_flight' } }
        )
        .exec()
        .then(({ modifiedCount }) => {
            if (modifiedCount !== 1) {
                rejectResponse(response, 409, [
                    {
                        code: ERROR_CODES.IDEMPOTENCY_IN_FLIGHT,
                        message: t('generic.error-idempotency-in-flight')
                    }
                ]);
                return;
            }
            if (claim.doNotRetry) {
                answerOutcomeUnknown(claim, claim.doNotRetry, existing, response);
                return;
            }
            armOutcomeCapture(response, claim);
            next();
        });

/**
 * Whether this `end` call closes an answer that has no body at all: no chunk handed to `end`
 * (its first argument is absent or the callback) and nothing flushed before it.
 *
 * @param response - the response being ended
 * @param firstArgument - the first argument `end` was called with
 */
const endsBodiless = (response: Response, firstArgument: unknown): boolean =>
    (firstArgument === undefined || typeof firstArgument === 'function') && !response.headersSent;

/**
 * A keyed answer ended with bytes the ledger cannot capture (`send`, `write` + `end`): the key
 * stays in flight rather than store a body-less record that would replay truncated.
 *
 * @param key - the caller-supplied `Idempotency-Key`
 */
const warnUnrecordableEnd = (key: string): void => {
    logger.warn({
        message: 'Idempotency answer ended with a body outside json; the key stays in flight.',
        key
    });
};

/**
 * Make a later hit on this same `(key, caller)` write its own outcome back to the ledger the
 * moment the guarded handler answers — success or a handled error alike, since both are a
 * finished attempt a retry should replay rather than re-run.
 *
 * Wraps `response.json` rather than hooking `finish`, same reasoning as `cache.ts`'s
 * `armCacheWrite`: `json` is the one place that already has the parsed body in hand.
 * A bodiless answer (`202` through `acceptedResponse`) never reaches `json`, so `end` is wrapped
 * too and records it with no body; `json` ends through `end`, hence the `recorded` latch.
 * An `end` that carries bytes (or follows a `write`) is not recorded: see {@link endsBodiless}.
 *
 * The write is tracked in {@link pendingMarks}, so a shutdown waits for it. One that fails leaves
 * the key `in_flight`: harmless to an ordinary key (a retry takes it over after the lease), but on
 * a do-not-retry key a retry then answers "outcome unknown", so it logs at `error`.
 *
 * @param response - the response whose `json` and `end` methods are being overridden
 * @param claim - the key this attempt holds
 */
const armOutcomeCapture = (response: Response, claim: Claim): void => {
    const { key, caller } = claim;
    let recorded = false;

    /** Writes the outcome once; a second call (json, then the end it triggers) is a no-op. */
    const record = (body: unknown): void => {
        if (recorded) return;
        recorded = true;
        const write = idempotencyRecordModel
            .updateOne(
                { key, caller },
                {
                    $set: {
                        state: 'done',
                        status: response.statusCode,
                        body,
                        // Set by `createdResponse` before it calls `json`; absent on every non-201.
                        location: response.getHeader('location')?.toString(),
                        // Set by `rejectResponse` (problem+json); absent where Express defaults it.
                        contentType: response.getHeader('content-type')?.toString(),
                        headers: replayedHeadersOf(response)
                    }
                }
            )
            .exec()
            .then(() => undefined)
            .catch((error: unknown) => {
                // The response has already gone out — there is nothing left to roll back. Left
                // 'in_flight', the record rides out its TTL, exactly as if the process had
                // crashed here; a retry past the lease is then treated as a crashed attempt.
                // Stryker disable all
                logger[claim.doNotRetry ? 'error' : 'warn']({
                    message:
                        'Idempotency record could not be marked done; it will expire in-flight.',
                    key,
                    error
                });
                // Stryker restore all
            });
        pendingMarks.add(write);
        // `write` never rejects (its own `catch` logs), so both arms only forget it.
        const forget = (): void => {
            pendingMarks.delete(write);
        };
        void write.then(forget, forget);
    };

    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        record(body);
        return responseJson(body);
        // The wrapper records the body then returns what the original `json` returns.
    }) as Response['json'];

    const responseEnd = response.end.bind(response);
    // `end` has several overloads; the wrapper forwards whatever it was given untouched.
    response.end = ((...endArguments: Parameters<Response['end']>) => {
        if (!recorded) {
            if (endsBodiless(response, endArguments[0])) record(undefined);
            else warnUnrecordableEnd(key);
        }
        return responseEnd(...endArguments);
        // `end` is overloaded, so the wrapper's rest-args signature cannot be matched to any one
        // overload; it forwards its arguments untouched.
    }) as Response['end'];
};

/**
 * The three things a colliding key can mean, once the insert that would have been the lock
 * fails on E11000 instead.
 *
 * @param existing - the record already holding this `(key, caller)`
 * @param fingerprint - this request's own fingerprint — see {@link fingerprintOf}
 */
const respondToCollision = (
    response: Response,
    existing: StoredRecord,
    fingerprint: string
): Response => {
    if (existing.state === 'in_flight')
        return rejectResponse(response, 409, [
            {
                code: ERROR_CODES.IDEMPOTENCY_IN_FLIGHT,
                message: t('generic.error-idempotency-in-flight')
            }
        ]);

    if (existing.fingerprint !== fingerprint)
        return rejectResponse(response, 422, [
            {
                code: ERROR_CODES.IDEMPOTENCY_KEY_MISMATCH,
                message: t('generic.error-idempotency-key-mismatch')
            }
        ]);

    // Same key, same request: replay verbatim instead of running the handler a second time.
    response.set('Idempotent-Replayed', 'true');
    if (existing.location) response.location(existing.location);
    if (existing.contentType) response.type(existing.contentType);
    for (const [name, value] of Object.entries(existing.headers ?? {})) response.set(name, value);
    // The stored tag is the API's own, made by the first answer: a replay keeps it.
    if (existing.headers?.ETag !== undefined) keepEtag(response);
    // A bodiless outcome (202) replays bodiless: no JSON content type, no document.
    if (existing.body === undefined || existing.body === null)
        return response.status(existing.status ?? 200).end();
    return response.status(existing.status ?? 200).json(existing.body);
};

/**
 * The E11000 branch of {@link claimIdempotencyKey}: a live record already held the key, or one
 * just vanished under TTL reclaim in the window between the failed insert and this read.
 *
 * The vanished case is the one outcome {@link respondToCollision} does not cover: the slot is
 * genuinely open again, so this retries the CREATE once rather than falling through to a bare
 * `next()` — a bare `next()` would run the handler uncaptured, and a second request racing this
 * same window would see the same vanished record and do the same, doubling the very write this
 * mechanism exists to prevent. `retriesLeft` bounds it to one attempt: past that, two concurrent
 * retries have now genuinely raced each other into re-creating the record, so the second one's own
 * E11000 finds a real row to collide with on its `findOne` — the ordinary path, not the vanished
 * one. A do-not-retry key never falls through to `next()` at all: still nothing after the retry
 * means another request is racing for the slot, so it answers 409 in flight.
 *
 * @param claim - the key being claimed
 * @param retriesLeft - how many more times the create may be retried after a vanished record
 */
const onDuplicateKey = (
    claim: Claim,
    response: Response,
    next: NextFunction,
    retriesLeft: number
): Promise<void> =>
    idempotencyRecordModel
        .findOne({ key: claim.key, caller: claim.caller })
        .lean()
        .exec()
        .then((existing) => {
            if (!existing) {
                if (retriesLeft > 0) {
                    claimIdempotencyKey(claim, response, next, retriesLeft - 1);
                    return;
                }
                if (claim.doNotRetry) {
                    rejectResponse(response, 409, [
                        {
                            code: ERROR_CODES.IDEMPOTENCY_IN_FLIGHT,
                            message: t('generic.error-idempotency-in-flight')
                        }
                    ]);
                    return;
                }
                // Retried and still nothing to claim or find — give up rather than loop
                // forever; this one request runs uncaptured, same as before the retry.
                next();
                return;
            }

            if (existing.fingerprint === claim.fingerprint && isAbandoned(existing))
                return reclaimAbandoned(claim, existing, response, next);

            respondToCollision(response, existing, claim.fingerprint);
        })
        .catch((error: unknown) => {
            // The collision branch is the NORMAL path for a retried request — a failure
            // here (the lookup, or respondToCollision's own write) must still answer,
            // or the retry hangs until the client's own timeout instead of getting the
            // ordinary 500 a caller already knows how to handle.
            next(error);
        });

/**
 * Try to become the key's holder with one atomic insert; win it and the handler runs, with its
 * eventual answer captured for the next caller to find; lose it and {@link onDuplicateKey} decides
 * what the collision actually means.
 */
const claimIdempotencyKey = (
    claim: Claim,
    response: Response,
    next: NextFunction,
    retriesLeft: number
): void => {
    idempotencyRecordModel
        .create({
            key: claim.key,
            caller: claim.caller,
            fingerprint: claim.fingerprint,
            state: 'in_flight'
        })
        .then(() => {
            armOutcomeCapture(response, claim);
            next();
        })
        .catch((error: unknown) => {
            if (!isDuplicateKey(error)) {
                next(error);
                return;
            }

            return onDuplicateKey(claim, response, next, retriesLeft);
        });
};

/**
 * The shared body of {@link idempotencyKey} and {@link requireIdempotencyKey}: read and validate
 * the header, then claim the key. `doNotRetry` is the route's own mark, absent on an ordinary one.
 *
 * @param doNotRetry - the route's operation, for a do-not-retry route
 */
const handleKey = (
    request: Request,
    response: Response,
    next: NextFunction,
    doNotRetry?: DoNotRetrySubject
): void => {
    const raw = request.header(IDEMPOTENCY_KEY_HEADER);
    if (!raw) {
        next();
        return;
    }

    const match = KEY_PATTERN.exec(raw);
    // The inner value is the key, so `"abc"` and `abc` name one ledger record.
    const key = match?.[1] ?? match?.[2];
    if (!key) {
        rejectResponse(response, 422, [
            {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: t('generic.error-idempotency-key-invalid')
            }
        ]);
        return;
    }

    if (hasPrototypeKey(request.body)) {
        rejectResponse(response, 422, [
            {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: t('generic.error-idempotency-body-unsafe')
            }
        ]);
        return;
    }

    claimIdempotencyKey(
        {
            key,
            caller: callerKeyOf(request),
            fingerprint: fingerprintOf(request),
            ...(doNotRetry && { doNotRetry: doNotRetryFactsOf(request, doNotRetry) })
        },
        response,
        next,
        1
    );
};

/**
 * What a do-not-retry request adds to its claim: the route's operation, the subject's id from the
 * path, and the shop the caller acts in (none for a caller no guard resolved to a shop).
 *
 * @param request - the incoming request, already past its permission guard
 * @param subject - the route's own mark
 */
const doNotRetryFactsOf = (request: Request, subject: DoNotRetrySubject): DoNotRetryFacts => {
    const { caller } = request;
    const subjectId = request.params[subject.subjectParam];
    return {
        ...subject,
        subjectId: typeof subjectId === 'string' ? subjectId : '',
        ...(caller?.scope === 'tenant' && { tenantId: caller.tenantId })
    };
};

/**
 * `Idempotency-Key` support for one route — see the module doc for when to reach for it.
 *
 * No key on the request: a no-op, straight to `next()`. A key present: {@link claimIdempotencyKey}
 * does the rest.
 */
export const idempotencyKey: RequestHandler = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    handleKey(request, response, next);
};

/**
 * {@link idempotencyKey} for a do-not-retry operation: one repeated request moves money or stock
 * twice. The header is mandatory (a request without it answers 400 and never reaches the
 * handler), and a key whose first attempt never reported an outcome is never run again — past the
 * lease it answers a stored 409 `IDEMPOTENCY_OUTCOME_UNKNOWN` and staff are told. A key that is
 * present goes through exactly the same claim, replay and mismatch rules.
 *
 * A 5xx on such a route carries no `Retry-After`: the write may already have taken effect, so
 * "retry later" would be a lie.
 *
 * The returned handler is named `requireIdempotencyKey` on purpose: the route walks that look for
 * the key claim in a chain (the limiters-before-the-key test) match by function name.
 * https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
 *
 * @param subject - the operation and which path parameter names what it acts on
 */
export const requireIdempotencyKey = (subject: DoNotRetrySubject): RequestHandler =>
    function requireIdempotencyKey(request: Request, response: Response, next: NextFunction) {
        if (!request.header(IDEMPOTENCY_KEY_HEADER)) {
            rejectResponse(response, 400, [
                {
                    code: ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
                    message: t('generic.error-idempotency-key-required')
                }
            ]);
            return;
        }

        // A 503 here is not an invitation to retry: `rejectResponse` leaves its `Retry-After` off.
        markDoNotRetry(response);
        handleKey(request, response, next, subject);
    };
