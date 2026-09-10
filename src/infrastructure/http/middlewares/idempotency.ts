/**
 * @module
 * `Idempotency-Key` middleware: makes a retried write safe. Mounted per route, the way
 * `uploadLimiter` is — never globally, since a GET needs no replay protection and a route that is
 * already idempotent by construction (a provider callback keyed on its own reference, a
 * reservation keyed on a domain key, and so on) should not pay for a second mechanism.
 *
 * Opt-in at the HEADER level too: a caller who sends no `Idempotency-Key` gets no protection and
 * no refusal — the header is a courtesy the client asks for, not a requirement the server makes.
 *
 * The record lives in Mongo, not Redis: `docker-compose.yml` runs the cache with
 * `--maxmemory-policy allkeys-lru`, which can evict a live record under memory pressure and turn
 * an evicted entry into a silent duplicate write at exactly the moment the system is under load.
 * An idempotency ledger is a source of truth, so it goes in Mongo next to every other durable
 * thing that expires on a TTL — see `idempotency-model.ts`.
 *
 * See: docs/tools/idempotency.md
 */

import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rejectResponse } from '@infrastructure/http/response';
import { isDuplicateKey } from '@infrastructure/http/errors';
import { logger } from '@infrastructure/adapters/logger';
import { t } from '@infrastructure/i18n';
import {
    idempotencyRecordModel,
    type IdempotencyRecordDocument
} from '@infrastructure/http/middlewares/idempotency-model';

/** The header this middleware reads. Express lower-cases header names on `request.header()`. */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * What a legal key looks like: length and character class only, per the contract parameter
 * (`shared/contracts/openapi.root.yaml#/components/parameters/IdempotencyKeyHeader`) — this
 * repo does not validate that it is a UUID, only that it is convention (a UUID happens to match).
 */
const KEY_PATTERN = /^[\w-]{1,200}$/;

/**
 * `JSON.stringify`, but with every object's keys sorted first — so two requests carrying the
 * SAME body with its fields in a different order fingerprint identically. Safe to hand-write
 * rather than reach for a library: a body here is always what `express.json()` produced, so it
 * is plain JSON-safe data (no `Date`, no `undefined`, no cycle) by construction.
 *
 * @param value - a JSON-safe value, typically `request.body`
 */
const stableStringify = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;

    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
            a.localeCompare(b)
        );
        return `{${entries.map(([entryKey, entryValue]) => `${JSON.stringify(entryKey)}:${stableStringify(entryValue)}`).join(',')}}`;
    }

    return JSON.stringify(value);
};

/**
 * What this request IS, independent of who is asking: the method, the route pattern (not the
 * raw URL — a path parameter must not mint a new fingerprint) and the body. Two requests with
 * the same key but a different fingerprint are the client reusing a key for a different
 * request, which is a client bug this middleware exists to catch rather than paper over.
 *
 * @param request - the incoming request, already matched to its route
 */
const fingerprintOf = (request: Request): string => {
    // Express types `route` as `any` — same gap `getRouteLabel` (metrics-http.ts) reads through
    // `unknown` for. Only a plain string names a real template; anything else falls back to the
    // request's own path.
    const matchedRoute: unknown = request.route;
    const routeTemplate = (matchedRoute as { path?: unknown } | undefined)?.path;
    const routePath = typeof routeTemplate === 'string' ? routeTemplate : request.path;

    return createHash('sha256')
        .update(
            `${request.method} ${request.baseUrl}${routePath}\n${stableStringify(request.body ?? {})}`
        )
        .digest('hex');
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

/** Everything the three outcomes below need out of a stored record. */
type StoredRecord = Pick<IdempotencyRecordDocument, 'state' | 'fingerprint' | 'status' | 'body'>;

/**
 * Make a later hit on this same `(key, caller)` write its own outcome back to the ledger the
 * moment the guarded handler answers — success or a handled error alike, since both are a
 * finished attempt a retry should replay rather than re-run.
 *
 * Wraps `response.json` rather than hooking `finish`, same reasoning as `cache.ts`'s
 * `armCacheWrite`: `json` is the one place that already has the parsed body in hand.
 *
 * @param response - the response whose `json` method is being overridden
 * @param key - the caller-supplied `Idempotency-Key`
 * @param caller - this request's caller identity — see {@link callerKeyOf}
 */
const armOutcomeCapture = (response: Response, key: string, caller: string): void => {
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        void idempotencyRecordModel
            .updateOne(
                { key, caller },
                { $set: { state: 'done', status: response.statusCode, body } }
            )
            .exec()
            .catch((error: unknown) => {
                // The response has already gone out — there is nothing left to roll back. Left
                // 'in-flight', the record simply rides out its TTL and a retry sees 409 until
                // then, exactly as if the process had crashed here.
                logger.warn({
                    message:
                        'Idempotency record could not be marked done; it will expire in-flight.',
                    key,
                    error: error instanceof Error ? error.message : String(error)
                });
            });

        return responseJson(body);
    }) as Response['json'];
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
    if (existing.state === 'in-flight')
        return rejectResponse(response, 409, [
            { code: 'IDEMPOTENCY_IN_FLIGHT', message: t('generic.error-idempotency-in-flight') }
        ]);

    if (existing.fingerprint !== fingerprint)
        return rejectResponse(response, 422, [
            {
                code: 'IDEMPOTENCY_KEY_MISMATCH',
                message: t('generic.error-idempotency-key-mismatch')
            }
        ]);

    // Same key, same request: replay verbatim instead of running the handler a second time.
    response.set('Idempotent-Replay', 'true');
    return response.status(existing.status ?? 200).json(existing.body);
};

/**
 * `Idempotency-Key` support for one route — see the module doc for when to reach for it.
 *
 * No key on the request: a no-op, straight to `next()`. A key present: try to become its holder
 * with one atomic insert; win it and the handler runs, with its eventual answer captured for the
 * next caller to find; lose it and {@link respondToCollision} decides which of the three
 * outcomes this retry actually is.
 */
export const idempotencyKey: RequestHandler = (
    request: Request,
    response: Response,
    next: NextFunction
) => {
    const raw = request.header(IDEMPOTENCY_KEY_HEADER);
    if (!raw) {
        next();
        return;
    }

    if (!KEY_PATTERN.test(raw)) {
        rejectResponse(response, 422, [
            { code: 'VALIDATION_ERROR', message: t('generic.error-idempotency-key-invalid') }
        ]);
        return;
    }

    const caller = callerKeyOf(request);
    const fingerprint = fingerprintOf(request);

    idempotencyRecordModel
        .create({ key: raw, caller, fingerprint, state: 'in-flight' })
        .then(() => {
            armOutcomeCapture(response, raw, caller);
            next();
        })
        .catch((error: unknown) => {
            if (!isDuplicateKey(error)) {
                next(error);
                return;
            }

            return idempotencyRecordModel
                .findOne({ key: raw, caller })
                .lean()
                .exec()
                .then((existing) => {
                    // The record that just caused our E11000 is gone — TTL reclaimed it between
                    // the failed insert and this read. Treat it as a first request rather than
                    // surfacing a race the caller did nothing wrong to hit.
                    if (!existing) {
                        next();
                        return;
                    }

                    respondToCollision(response, existing, fingerprint);
                });
        });
};
