/**
 * @module
 * RabbitMQ (AMQP 0-9-1) adapter.
 *
 * Degrades:   like the cache adapter, every function no-ops when the broker is not configured —
 *             `publishToQueue` returns `false` and callers fall back to doing the work inline
 *             (see `adapters/mailer.ts` → `enqueueEmail`).
 * Reconnects: via amqplib's own opt-in `recovery` option (2.0.1+), not
 *             `@infrastructure/adapters/managed-connection`'s lifecycle — recovery retries the
 *             CONNECTION forever with backoff and re-runs `setup` after every successful
 *             (re)connect, exactly "declare the queues, re-bind every consumer", the one thing
 *             this adapter needs redone whenever the connection comes back.
 * Redis:      `managed-connection.ts`'s own lifecycle stays there instead, where recovery is
 *             demand-driven (the next cache read retries) rather than a background loop; only its
 *             shared warn-once latch is reused here.
 *
 * See: docs/tools/rabbitmq.md
 */

// `amqplib` is the AMQP 0-9-1 client. `ChannelModel` is the TCP connection `setup` receives on
// each (re)connect; `RecoveringChannelModel` is the wrapper `connect(url, { recovery })` resolves
// to, an EventEmitter for `connect`/`disconnect` that outlives every individual reconnect;
// `ConfirmChannel` is the session every command runs on (see `setupChannel`'s own docblock for why
// a confirm channel, not a plain one); `ConsumeMessage` is a delivered message — `.content`
// (Buffer) plus the delivery tag `ack`/`nack` reference; `MessagePropertyHeaders` is that
// message's headers, `x-death` (the retry-count RabbitMQ stamps for free) included.
import amqplib, {
    type ChannelModel,
    type RecoveringChannelModel,
    type ConfirmChannel,
    type ConsumeMessage,
    type MessagePropertyHeaders
} from 'amqplib';
import type { ZodType } from 'zod';
import { getJson } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';
import {
    unavailabilityLatch,
    type DependencyStatus
} from '@infrastructure/adapters/managed-connection';
import { WORKER_CHANNELS } from '@types';
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';
import { queueJobsDeadLetteredTotal } from '@infrastructure/observability/metrics-queue';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Build the AMQP connection URL from env vars.
 *
 * Same two-mode pattern as Redis/Mongo: a ready-made URL wins, otherwise assemble one from
 * fragments. `guest`/`guest` are RabbitMQ's built-in defaults, which only work over localhost.
 * Returns `undefined` when nothing is configured — the signal that the queue is off.
 */
const getAmqpUrl = (): string | undefined => {
    if (process.env.NODE_RABBITMQ_URL) return process.env.NODE_RABBITMQ_URL;
    // The port is the required fragment: without it there is nothing to assemble, so queue is off.
    if (!process.env.NODE_RABBITMQ_PORT) return;

    const host = process.env.NODE_RABBITMQ_HOST ?? '127.0.0.1';
    const port = process.env.NODE_RABBITMQ_PORT;
    const user = process.env.NODE_RABBITMQ_USER ?? 'guest';
    const pass = process.env.NODE_RABBITMQ_PASS ?? 'guest';
    return `amqp://${user}:${pass}@${host}:${port}`;
};

/**
 * Returns true when RabbitMQ is configured and not explicitly disabled.
 *
 * Exported (unlike the cache equivalent) because callers branch on it *before* building a
 * payload — see `enqueueEmail`, which sends inline rather than constructing a job envelope.
 */
export const isQueueEnabled = (): boolean =>
    Boolean(getAmqpUrl()) && environmentFlag('NODE_RABBITMQ_ENABLED', true);

// ─── Connection state ─────────────────────────────────────────────────────────

/**
 * The one channel this process publishes and consumes on — set by {@link setupChannel} on every
 * (re)connect, cleared on ITS OWN close. `undefined` means "take the slow lane", whether that is
 * disabled, still dialing, or between a drop and the next reconnect; nothing here ever waits for
 * it to become true (see {@link getChannel}).
 *
 * A CONFIRM channel, not a plain one: {@link publishToQueue} needs the broker's own
 * acknowledgement, not `sendToQueue`'s local return value, to tell a genuinely failed publish from
 * ordinary write-buffer backpressure — see that function's own docblock.
 */
let currentChannel: ConfirmChannel | undefined;

/**
 * The recovering connection, once {@link ensureConnecting} has kicked it off — the one handle
 * {@link stopQueue} can close. `undefined` before that, or once disabled; amqplib itself owns
 * everything about staying connected from here on.
 */
let recoveringConnection: RecoveringChannelModel | undefined;

/** Whether {@link ensureConnecting} has already dialed — separate from {@link recoveringConnection} so a burst of calls before the first connect settles shares the one attempt instead of each starting its own. */
let connectionStarted = false;

/**
 * Warn-once latch, shared by a publish that fails mid-flight and the connection's own
 * `disconnect` event, so either path reports the outage exactly once.
 *
 * `error`, not `warn`: unlike the cache, a dead queue is not just a lost optimisation —
 * `quarantineUploadedImages` and `enqueueImageDigest` both degrade to running work inline, which
 * changes request latency and revives the unawaited-fallback race this was written to close.
 */
const unavailabilityLog = unavailabilityLatch((error) =>
    // Stryker disable next-line all
    logger.error({ message: 'RabbitMQ unavailable, queue operations will be skipped.', error })
);

/**
 * How long {@link setupChannel} waits before re-opening a channel that closed while its
 * connection stayed up — long enough that a broker mid-restart (the ordinary cause of a
 * `PRECONDITION_FAILED`) has a moment to settle, short enough that a burst of unavailable-queue
 * publishes during the gap stays brief.
 */
const CHANNEL_REOPEN_DELAY_MS = 1000;

/**
 * amqplib's recovery `setup` — runs after every successful (re)connect, the first one included,
 * and is AWAITED before that connect counts as done. The one place a fresh channel is created and
 * every known consumer re-bound: a fresh channel starts with none of its own, whether this is
 * boot's first one (nothing registered yet — {@link replayConsumers} is a no-op) or a reconnect's
 * (the old channel took them with it).
 *
 * @param model - the fresh connection this (re)connect opened
 */
const setupChannel = async (model: ChannelModel): Promise<void> => {
    // https://amqp-node.github.io/amqplib/channel_api.html#confirms — a confirm channel's
    // `sendToQueue` gains a callback the broker invokes once it has actually accepted (or
    // refused) the message, which is what lets `publishToQueue` tell a real failure from
    // `sendToQueue`'s own local buffer-full signal.
    const ch = await model.createConfirmChannel();
    // A channel dies on its own for ordinary reasons (most of them named by `assertJobQueue`
    // below) WITHOUT the connection closing — recovery only reacts to a connection drop, so this
    // has to be handled separately: re-open a fresh channel on the SAME connection after a short
    // backoff. If the connection is ALSO down, `createConfirmChannel` below rejects harmlessly —
    // amqplib's own recovery reaches `setupChannel` again once it reconnects, same as any other
    // (re)connect; this is only for the channel-only close that recovery never sees at all.
    ch.on('error', unavailabilityLog.report);
    ch.on('close', () => {
        if (currentChannel !== ch) return;
        currentChannel = undefined;
        // `.unref()` — same reasoning as `RECOVERY_OPTIONS`'s own docblock: a timer nothing else
        // is waiting on must not be the reason a test process (or a graceful shutdown) hangs.
        const retry = setTimeout(() => {
            void setupChannel(model).catch(unavailabilityLog.report);
        }, CHANNEL_REOPEN_DELAY_MS);
        retry.unref();
    });
    currentChannel = ch;
    await replayConsumers(ch);
};

/**
 * amqplib's own retry timer is never `.unref()`'d, so with the library default (`maxRetries:
 * Infinity`) an unreachable broker keeps the event loop alive on its own — correct for a
 * long-running server, which is never meant to exit on its own anyway, but wrong for a test
 * process that needs to exit cleanly once its suite finishes. `.env` names the compose hostname,
 * which resolves nowhere outside it, so this is the routine case locally, not an edge one — hence
 * `maxRetries: 0` under test: try once, and if that fails, stay `unavailable` for the rest of the
 * run rather than retrying forever in the background.
 */
const RECOVERY_OPTIONS = {
    setup: setupChannel,
    ...(process.env.NODE_ENV === 'test' ? { maxRetries: 0 } : {})
};

/**
 * Kick off the recovering connection if nothing has already — idempotent, so every public
 * function below may call it defensively without risking a second connection racing the first.
 *
 * Its own promise is never awaited, on purpose (`docs/tools/rabbitmq.md`): with recovery on, that
 * promise settles only once the FIRST connect actually succeeds, retrying forever underneath in
 * production — awaiting it here would stop the app booting until a broker answers.
 */
const ensureConnecting = (): void => {
    if (connectionStarted || !isQueueEnabled()) return;
    const url = getAmqpUrl();
    // `isQueueEnabled()` already implies a URL; this is the type narrowing.
    if (!url) return;
    connectionStarted = true;

    // https://github.com/amqp-node/amqplib#opt-in-recovery — `setup` is awaited before THIS
    // promise resolves, so by the time it does, `currentChannel` is already set.
    void amqplib
        .connect(url, { recovery: RECOVERY_OPTIONS })
        .then((model) => {
            recoveringConnection = model;

            // Fires on every RECONNECT — never on this first connect, which is what THIS promise
            // IS resolving for; a listener attached here cannot also catch the event that led to it.
            model.on('connect', () => {
                if (!unavailabilityLog.clear()) return;
                // Stryker disable next-line all
                logger.info({ message: 'RabbitMQ reachable again, queue operations resumed.' });
            });
            model.on('disconnect', (error) => {
                currentChannel = undefined;
                unavailabilityLog.report(error);
            });
        })
        // Only reachable when `maxRetries` is finite (`NODE_ENV=test` above) — production's
        // `Infinity` default never rejects this promise, so there is nothing to catch there.
        .catch(unavailabilityLog.report);
};

/**
 * The current channel, or `undefined` to mean "take the slow lane" — disabled, still dialing, or
 * between a drop and the next reconnect look identical to every caller, which already falls back
 * to inline work either way. Synchronous and never itself dials: {@link ensureConnecting} is a
 * separate, idempotent nudge, not a wait.
 */
const getChannel = (): ConfirmChannel | undefined => {
    ensureConnecting();
    return isQueueEnabled() ? currentChannel : undefined;
};

/**
 * What this adapter's connection is doing, for `GET /observability/health`. No I/O — see the
 * header of `modules/observability/services/dependency-health.ts` for why a health endpoint never
 * dials the broker; `ready`/`unavailable` cover every "not disabled" state, `connecting` included,
 * since amqplib's recovery makes no distinction visible from out here.
 */
export const queueState = (): DependencyStatus => {
    if (!isQueueEnabled()) return 'disabled';
    return currentChannel ? 'ready' : 'unavailable';
};

/**
 * Warm up RabbitMQ during app startup — pays the handshake cost at boot instead of on the first
 * user request. Never blocks on it: see {@link ensureConnecting}.
 */
export const startQueue = (): Promise<void> => {
    ensureConnecting();
    return Promise.resolve();
};

/**
 * Gracefully close the RabbitMQ connection.
 *
 * A connection never reached (the broker stayed down for this process's whole life) has nothing
 * of ours to close — amqplib's own retry timer is still running underneath, and is left to the
 * process's forced-exit deadline (`server-lifecycle.ts`) rather than chased here.
 */
export const stopQueue = (): Promise<void> => {
    const connection = recoveringConnection;
    recoveringConnection = undefined;
    connectionStarted = false;
    currentChannel = undefined;
    unavailabilityLog.clear();
    if (!connection) return Promise.resolve();
    return connection.close().catch(() => undefined);
};

// ─── Queue names ──────────────────────────────────────────────────────────────

/**
 * The queues this application uses, spelled by the contract that declares them.
 *
 * A queue name is the one thing a producer and consumer must agree on exactly — a typo on either
 * side is not an error anywhere, it is a message published to a queue nobody drains. So the
 * spelling comes from `WORKER_CHANNELS`, generated out of `asyncapi.yaml`.
 *
 * See: docs/api/asyncapi-workflow.md#rabbitmq-queue-channels
 */
export const EMAIL_QUEUE = WORKER_CHANNELS.EMAIL_SEND;

/** Same sourcing as {@link EMAIL_QUEUE} — the image-digest queue. */
export const IMAGE_QUEUE = WORKER_CHANNELS.IMAGE_DIGEST;

// ─── Retries and dead letters ───────────────────────────────────────────────────

/**
 * The exchange every failed/refused message is routed through, so a `deadLetterRoutingKey` means
 * "moved for a reason" rather than "destroyed". `direct`, so each queue's messages land exactly
 * where their routing key names — the retry queue, or back on the work queue once a retry's TTL
 * expires (see {@link assertJobQueue}).
 */
export const DEAD_LETTER_EXCHANGE = 'dead-letter';

/**
 * The parking lot for a work queue's exhausted or permanently-rejected messages — a plain durable
 * queue with no consumer and no `x-dead-letter-*` of its own. Nothing routes here automatically any
 * more (see {@link assertJobQueue}); `handleDelivery` publishes to it directly, once, the moment a
 * message is decided to be done retrying.
 *
 * @param queue - the work queue
 * @returns the name of the queue its refusals land in
 */
export const deadLetterQueueOf = (queue: string): string => `${queue}.dead`;

/**
 * The TTL holding queue a work queue's failed messages wait in before RabbitMQ redelivers them —
 * the broker owns the delay, not an app-side timer. No consumer ever binds here.
 *
 * @param queue - the work queue
 * @returns the name of its retry queue
 */
export const retryQueueOf = (queue: string): string => `${queue}.retry`;

/**
 * Every worker queue's current dead-letter depth, read live off the broker.
 *
 * Why:      the one part of `GET /observability/health`'s `queues` field that DOES do I/O (see
 *           `modules/observability/services/dependency-health.ts`'s header for why the rest never
 *           does) — a queue's parked count exists nowhere else in this process, unlike every
 *           other dependency's state, which is already tracked in memory.
 * Channel:  a dedicated, short-lived one, never {@link getChannel}'s shared one. `assertQueue` on
 *           a queue this process has never published to or consumed from creates it, harmlessly,
 *           with the same `durable: true` {@link assertJobQueue} already declares its dead-letter
 *           queues with — but any OTHER broker error on this call closes whatever channel it ran
 *           on, and the shared channel every publisher depends on is not something a health check
 *           may risk.
 * Settling: `Promise.allSettled`, not `Promise.all` — one queue's failure closing the channel must
 *           not zero out the queues already checked before it; a partial answer is still useful,
 *           an empty one looks like "nothing is parked anywhere," a false negative.
 *
 * @returns one entry per queue this call reached before anything went wrong — empty when
 *   disabled, not yet connected, or unreachable
 */
export const parkedCounts = (): Promise<{ name: string; parked: number }[]> => {
    if (!isQueueEnabled() || !recoveringConnection) return Promise.resolve([]);
    const connection = recoveringConnection;

    return connection
        .createChannel()
        .then((ch) =>
            Promise.allSettled(
                Object.values(WORKER_CHANNELS).map((queue) =>
                    ch
                        .assertQueue(deadLetterQueueOf(queue), { durable: true })
                        .then((ok) => ({ name: queue, parked: ok.messageCount }))
                )
            )
                .then((results) =>
                    results.flatMap((result) =>
                        result.status === 'fulfilled' ? [result.value] : []
                    )
                )
                .finally(() => {
                    ch.close().catch(() => undefined);
                })
        )
        .catch(() => []);
};

/**
 * Deployment-wide default: deliveries a job gets before it is parked in
 * {@link deadLetterQueueOf}. A consumer that needs a different number declares it on its own
 * `ConsumeOptions`, next to its handler — not a second environment variable.
 */
const defaultMaxAttempts = (): number => environmentNumber('NODE_QUEUE_MAX_ATTEMPTS', 5, 1);

/**
 * Deployment-wide default: how long a failed job waits in {@link retryQueueOf} before RabbitMQ
 * dead-letters it back onto the work queue. One fixed delay per queue (not per message) is what
 * keeps this ONE retry queue per work queue and sidesteps RabbitMQ's head-of-line expiry rule — a
 * 5s message queued behind a 10-hour one would otherwise wait 10 hours, since a queue only expires
 * from the head.
 */
const defaultRetryDelaySeconds = (): number =>
    environmentNumber('NODE_QUEUE_RETRY_DELAY_SECONDS', 30, 1);

/**
 * The two job-priority levels every work queue supports, named rather than passed as raw numbers
 * so a publish call reads as intent (`'high'`) instead of a magic 0/1 whose meaning lives only
 * here. Kept to two on purpose: RabbitMQ's priority ordering is approximate under load — it
 * reorders within whatever is currently buffered, not a strict global heap — so more levels would
 * invite a false sense of a real scheduler. The idea is one gap, between "most things" and "the
 * few things a person is actively blocked on," not a fine-grained priority system.
 *
 * See: docs/tools/rabbitmq.md#priority
 */
export type JobPriority = 'normal' | 'high';

/** `JobPriority` as the number RabbitMQ's `priority` publish option and `x-max-priority` expect. */
const JOB_PRIORITY_VALUES: Record<JobPriority, number> = { normal: 0, high: 1 };

/**
 * Declare a work queue and its two companions, wired for the retry design
 * (`docs/tools/rabbitmq.md#retries-and-parking`):
 *
 * ```
 * work queue ──(nack, requeue=false)──▶ <queue>.retry (TTL, no consumer) ──(expires)──▶ work queue
 * ```
 *
 * Routing:    the work queue's `deadLetterRoutingKey` points at `<queue>.retry`, never
 *             `<queue>.dead` — a `nack(msg, false, false)` always means "try again later".
 *             `<queue>.retry` points BACK at the work queue (bound under the work queue's own
 *             name), so a message that sits out its TTL there reappears on the work queue with
 *             RabbitMQ's own `x-death` array one entry longer — the free attempt count
 *             `handleDelivery` reads. `<queue>.dead` gets no exchange binding at all: nothing
 *             dead-letters into it automatically, since a permanent rejection and an exhausted
 *             retry both need to skip the retry cycle entirely, which only an explicit publish can
 *             guarantee.
 * Idempotent: called on both publish and consume paths so producer and consumer may start in any
 *             order — both must agree on `retryDelaySeconds` for the same queue, the same way they
 *             already must agree on `durable`, or `assertQueue` throws `PRECONDITION_FAILED` on
 *             the second call. In practice this app's consumers register at boot
 *             (`app/workers.ts`), before anything publishes.
 * Upgrading:  see `docs/tools/rabbitmq.md` for upgrading an existing broker — the dead-letter
 *             target changing shape here is exactly the kind of change that needs one.
 *
 * @param ch - the channel to declare on
 * @param queue - the work queue
 */
const assertJobQueue = (ch: ConfirmChannel, queue: string): Promise<void> => {
    const retryQueue = retryQueueOf(queue);
    // Always {@link defaultRetryDelaySeconds} — there is no per-consumer override, which is what
    // keeps producer and consumer trivially agreeing (see the docblock above).
    const retryDelaySeconds = defaultRetryDelaySeconds();

    return ch
        .assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true })
        .then(() => ch.assertQueue(deadLetterQueueOf(queue), { durable: true }))
        .then(() =>
            ch.assertQueue(retryQueue, {
                durable: true,
                messageTtl: retryDelaySeconds * 1000,
                deadLetterExchange: DEAD_LETTER_EXCHANGE,
                deadLetterRoutingKey: queue
            })
        )
        .then(() => ch.bindQueue(retryQueue, DEAD_LETTER_EXCHANGE, retryQueue))
        .then(() =>
            ch.assertQueue(queue, {
                // `durable` = the queue definition survives a broker restart. Every work queue
                // gets it — no caller has ever asked for a transient one.
                durable: true,
                deadLetterExchange: DEAD_LETTER_EXCHANGE,
                deadLetterRoutingKey: retryQueue,
                // `x-max-priority`: the ceiling `JOB_PRIORITY_VALUES` publishes against. Every
                // queue gets it, so any producer may opt into `priority: 'high'` without a
                // separate per-queue declaration.
                // https://www.rabbitmq.com/docs/priority
                arguments: { 'x-max-priority': Math.max(...Object.values(JOB_PRIORITY_VALUES)) }
            })
        )
        .then(() => ch.bindQueue(queue, DEAD_LETTER_EXCHANGE, queue))
        .then(() => undefined);
};

// ─── Publish ──────────────────────────────────────────────────────────────────

/** One publish, described in full — every caller of {@link publishToQueue} passes this object. */
export interface PublishOptions<TPayload = unknown> {
    /** Queue name to publish to. */
    queue: string;
    /** Message payload (will be JSON-serialized). */
    payload: TPayload;
    /** How eagerly the broker should deliver this ahead of others waiting on the same queue. Default: `'normal'`. */
    priority?: JobPriority;
}

/**
 * How long {@link publishToQueue} waits for the broker's own confirmation before giving up and
 * falling back to the caller's inline path. Generous, since the alternative — a false "failed" on
 * a broker that is merely slow — is exactly the shape of double-run this confirm design exists to
 * narrow. It narrows the window, not closes it: a confirmation that lands AFTER this timeout
 * still resolves the original publish (amqplib's callback fires whenever the broker actually
 * answers), so a broker that takes longer than this to confirm still runs the job twice — once
 * from the caller's inline fallback, once from the publish that eventually succeeded on its own.
 */
const PUBLISH_CONFIRM_TIMEOUT_MS = 5000;

/**
 * Publish a message to a queue. No-op when RabbitMQ is not configured.
 *
 * Topology: the *default exchange* (empty name), where the routing key IS the queue name — the
 *           simplest AMQP topology there is. `TPayload` is the job envelope: naming it explicitly
 *           (`publishToQueue<EmailJobPayload>(…)`) checks this call against the same type its
 *           consumer declares, so a field added on one side and forgotten on the other is a
 *           compile error, not a 3am silent drop.
 * Confirms: waits for the BROKER's own confirmation, not `sendToQueue`'s return value — that
 *           boolean means "amqplib's local write buffer is full" (backpressure), never "failed".
 *           Treating it as a failure runs a caller's inline fallback ALONGSIDE a publish that is
 *           going to succeed anyway, producing two runs of the same job. A confirm channel's
 *           callback (https://amqp-node.github.io/amqplib/channel_api.html#confirms) fires once
 *           the broker has actually accepted or refused the message, regardless of what the local
 *           buffer was doing — that is the one signal this function trusts.
 *
 * @returns `true` once the broker confirms the message, `false` when the queue is unavailable, the
 *          broker refuses it, or confirmation does not arrive within
 *          {@link PUBLISH_CONFIRM_TIMEOUT_MS} — callers use this to decide whether to fall back to
 *          inline work.
 */
export const publishToQueue = <TPayload = unknown>(
    options: PublishOptions<TPayload>
): Promise<boolean> => {
    const ch = getChannel();
    if (!ch) return Promise.resolve(false);

    const { queue, payload, priority = 'normal' } = options;

    return assertJobQueue(ch, queue)
        .then(
            () =>
                new Promise<boolean>((resolve) => {
                    let settled = false;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        resolve(false);
                    }, PUBLISH_CONFIRM_TIMEOUT_MS);

                    // `sendToQueue(queue, content, options, callback)` — content must be a
                    // Buffer, so the payload is JSON-serialized here and parsed back in
                    // `consumeFromQueue`. The RETURN VALUE is deliberately ignored: it is
                    // amqplib's local buffer-full signal, not the broker's answer, which only
                    // the callback below carries.
                    ch.sendToQueue(
                        queue,
                        Buffer.from(JSON.stringify(payload)),
                        {
                            // `persistent` = the *message* is written to disk. Both this and a
                            // durable queue are required to survive a restart: a durable queue
                            // with transient messages comes back empty. Every job publishes
                            // persistent — no caller has ever asked for a transient one.
                            persistent: true,
                            priority: JOB_PRIORITY_VALUES[priority]
                        },
                        (error: unknown) => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            resolve(!error);
                        }
                    );
                })
        )
        .catch((error: unknown) => {
            unavailabilityLog.report(error);
            return false;
        });
};

// ─── Consume ──────────────────────────────────────────────────────────────────

/** One consumer's registration — the queue, the handler, and the contract its messages must meet. */
export interface ConsumeOptions<TPayload = unknown> {
    /** Queue name to consume from. */
    queue: string;
    /** Handler called for each message. Return true to ack, false to PARK — a permanent business rejection, never retried. Throw instead for a transient failure, which nacks and retries. */
    handler: (message: TPayload, raw: ConsumeMessage) => Promise<boolean>;
    /**
     * The contract schema this queue's messages must satisfy, from
     * `@types`' generated validators.
     *
     * A payload crosses a process boundary, which is where its TypeScript type stops being a fact
     * and becomes a claim. Supplying this turns the claim back into a check; omitting it leaves
     * the handler to defend itself.
     */
    schema?: ZodType;
    /** Number of unacknowledged messages allowed at once. Default: 1. */
    prefetch?: number;
}

/**
 * Parse a delivered message's JSON body.
 *
 * `undefined` is a safe failure sentinel: valid JSON never parses to it.
 *
 * @param incoming - the raw delivered message
 * @returns the parsed value, or `undefined` when the body is not valid JSON
 */
const parseMessageBody = (incoming: ConsumeMessage): unknown =>
    // `.content` is a Buffer; `toString()` assumes UTF-8 JSON, matching what `publishToQueue` writes.
    getJson(incoming.content.toString());

/**
 * How many times THIS delivery has already cycled through the retry queue — the count RabbitMQ
 * stamps for free every time it dead-letters a message, read back off the header it arrives with.
 * `0` for a first delivery: nothing has dead-lettered it into the retry queue yet, so no entry for
 * that queue exists.
 *
 * @param headers - the delivered message's own headers
 * @param retryQueue - this work queue's retry companion (`retryQueueOf(queue)`)
 */
const deathCountFor = (headers: MessagePropertyHeaders | undefined, retryQueue: string): number =>
    headers?.['x-death']?.find((entry) => entry.queue === retryQueue)?.count ?? 0;

/**
 * Ack a delivery, swallowing the throw amqplib raises for a channel that has already closed.
 * `handleDelivery`'s promise-based ack decision can settle AFTER its channel closed (a
 * broker-side close racing a slow handler), and an unguarded `ch.ack` on a dead channel throws
 * SYNCHRONOUSLY from inside amqplib's own event plumbing — escaping every `.catch` in this file
 * and reaching Node as an uncaught exception that kills the process. `currentChannel !== ch` is
 * the same "superseded" signal `setupChannel`'s own close handler uses: there is nothing useful
 * left to ack on a dead channel — the message is simply redelivered once RabbitMQ notices the
 * consumer is gone, the ordinary unacked-message-on-a-closed-channel behaviour.
 */
const safeAck = (ch: ConfirmChannel, incoming: ConsumeMessage): void => {
    if (currentChannel !== ch) return;
    // eslint-disable-next-line no-restricted-syntax -- amqplib throws synchronously for a channel that already closed; this is the guard, not a swallowed rejection
    try {
        ch.ack(incoming);
    } catch (error) {
        unavailabilityLog.report(error);
    }
};

/** {@link safeAck}'s `nack` counterpart — same guard, same reasoning. */
const safeNack = (
    ch: ConfirmChannel,
    incoming: ConsumeMessage,
    allUpTo: boolean,
    requeue: boolean
): void => {
    if (currentChannel !== ch) return;
    // eslint-disable-next-line no-restricted-syntax -- amqplib throws synchronously for a channel that already closed; this is the guard, not a swallowed rejection
    try {
        ch.nack(incoming, allUpTo, requeue);
    } catch (error) {
        unavailabilityLog.report(error);
    }
};

/**
 * Move a message straight into `<queue>.dead`, bypassing the retry queue entirely.
 *
 * When:      the shared ending for every PERMANENT rejection (unparseable, contract failure,
 *            handler-refused) and for a throw whose {@link deathCountFor} has reached the limit.
 *            None of these may reach the retry queue: a `nack` would, since the work queue's own
 *            `deadLetterRoutingKey` always points there (see `assertJobQueue`), which is exactly
 *            why this publishes directly instead.
 * Confirmed: the same way {@link publishToQueue} is — only acks the original once the broker has
 *            actually accepted the parked copy, so a publish failure here can never silently drop
 *            the job; on that failure this nacks with requeue instead, the ordinary "try the whole
 *            delivery again" path, rather than pretending the park succeeded.
 *
 * @param ch - the channel to publish and ack/nack on
 * @param queue - the work queue this message came from
 * @param incoming - the raw delivered message, moved byte-for-byte
 */
const parkInDead = (ch: ConfirmChannel, queue: string, incoming: ConsumeMessage): void => {
    ch.sendToQueue(
        deadLetterQueueOf(queue),
        incoming.content,
        { persistent: true, headers: incoming.properties.headers },
        (error: unknown) => {
            if (error) {
                // Stryker disable all
                logger.error({
                    message: 'Failed to park a job in its dead-letter queue; redelivering instead.',
                    queue,
                    error
                });
                // Stryker restore all
                safeNack(ch, incoming, false, true);
                return;
            }
            queueJobsDeadLetteredTotal.inc({ queue });
            safeAck(ch, incoming);
        }
    );
};

/**
 * Handle one delivered message: parse it, run the caller's handler, and translate the outcome
 * into ack / nack (retry) / {@link parkInDead} (done retrying).
 *
 * Split out of `consumeFromQueue` because amqplib's `consume` callback fires once per delivery
 * for the process lifetime, not once during the connect/prefetch chain that registers it — so
 * the ack-decision logic gets its own ≤3-level depth instead of piling inside that chain.
 *
 * @param ch - channel to ack/nack/park on
 * @param queue - queue name, for the parse-failure log line
 * @param handler - caller's per-message handler
 * @param incoming - the raw delivered message
 * @param maxAttempts - deliveries this queue's jobs get before {@link parkInDead} —
 *   {@link defaultMaxAttempts}, the one deployment-wide number every consumer shares
 */
const handleDelivery = <TPayload>(
    ch: ConfirmChannel,
    queue: string,
    handler: ConsumeOptions<TPayload>['handler'],
    incoming: ConsumeMessage,
    maxAttempts: number,
    schema?: ZodType
): void => {
    const parsed = parseMessageBody(incoming);
    if (parsed === undefined) {
        // Malformed message — permanent: the bytes will never become valid JSON on a retry.
        // Stryker disable next-line all
        logger.warn({ message: 'Queue message parse failed, parking.', queue });
        parkInDead(ch, queue, incoming);
        return;
    }

    /*
     * Dead-lettered, not requeued, for the same reason a parse failure is: a message that does not
     * match the contract will not start matching it on a retry. Logged at `warn` with the reason,
     * because the interesting case is not this one message — it is a producer that has drifted.
     */
    const verdict = schema?.safeParse(parsed);
    if (verdict && !verdict.success) {
        // Stryker disable all
        logger.warn({
            message: 'Queue message failed contract validation, parking.',
            queue,
            issues: verdict.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`)
        });
        // Stryker restore all
        parkInDead(ch, queue, incoming);
        return;
    }

    /*
     * The one assertion in this pipeline: this is where bytes become a value, and `JSON.parse`
     * can't know `TPayload` — no generic makes it. The handler still checks the fields it needs
     * before using them, which is why workers narrow with a predicate and declare their payload
     * `Partial<…>` rather than fully-formed. Keeping it here means it happens once, at the
     * boundary, instead of once per worker.
     */
    // The handler's boolean *is* the ack decision — see the policy above.
    handler(parsed as TPayload, incoming)
        .then((ack) => {
            // `ack` removes the message from the queue permanently.
            if (ack) safeAck(ch, incoming);
            // Handled but refused: permanent business rejection — parked, not retried.
            else parkInDead(ch, queue, incoming);
        })
        .catch((error: unknown) => {
            // Thrown = presumed transient (DB down, SMTP timeout). `nack(requeue=false)` still
            // routes through the work queue's OWN dead-letter target, which is the retry queue —
            // so this still means "try again", just via the broker's TTL instead of instantly.
            const retryQueue = retryQueueOf(queue);
            const attemptsSoFar = deathCountFor(incoming.properties.headers, retryQueue) + 1;
            if (attemptsSoFar < maxAttempts) {
                safeNack(ch, incoming, false, false);
                return;
            }

            // Stryker disable all
            logger.error({
                message: 'Job exhausted its retries; parking.',
                queue,
                attempts: attemptsSoFar,
                error
            });
            // Stryker restore all
            parkInDead(ch, queue, incoming);
        });
};

/**
 * Declare the queue and register one consumer's callback on it — the whole of what "consuming a
 * queue" means to amqplib. Split out of {@link consumeFromQueue} so the exact same steps run
 * whether this is the first registration or a REPLAY of one onto a freshly (re)connected channel —
 * see {@link consumerBindings}.
 *
 * Acknowledgement policy (enforced by {@link handleDelivery}):
 *  - handler resolves `true`     → `ack` — done, broker deletes the message
 *  - handler resolves `false`    → parked — permanent business rejection, never retried
 *  - handler *throws*, attempts left → `nack` with no requeue — routes to the retry queue, which
 *    redelivers it once its TTL expires
 *  - handler *throws*, attempts exhausted → parked, logged (`queue`, `attempts`, `error` —
 *    never the payload, which passes the logger's redaction but is still a leak in a log line)
 *  - unparseable / contract-invalid message → parked — will never become valid on a retry
 *
 * "Parked" is always {@link parkInDead}: a direct publish to `<queue>.dead`, bypassing the retry
 * queue and its DLX chain entirely, and only ack'd once that publish is itself confirmed.
 */
const bindConsumer = <TPayload>(
    ch: ConfirmChannel,
    options: ConsumeOptions<TPayload>
): Promise<void> => {
    const { queue, handler, schema, prefetch = 1 } = options;
    const maxAttempts = defaultMaxAttempts();

    return (
        // Same idempotent declaration as on the publish side — the consumer may boot first.
        assertJobQueue(ch, queue)
            // `prefetch` (AMQP basic.qos) caps unacked messages per consumer. With 1, the broker
            // hands over the next message only after the current one is acked, which gives fair
            // round-robin across replicas instead of one worker hoarding a batch.
            .then(() => ch.prefetch(prefetch))
            .then(() =>
                // `consume` registers the callback and returns a consumerTag (unused here, since
                // the consumer lives for the channel's lifetime — see `replayConsumers`).
                ch.consume(queue, (incoming) => {
                    // `null` is delivered when the consumer is cancelled broker-side (queue
                    // deleted, channel closing) — nothing to ack.
                    if (!incoming) return;

                    handleDelivery(ch, queue, handler, incoming, maxAttempts, schema);
                })
            )
            // Discard the consumerTag reply; callers only need "consumer registered".
            .then(() => undefined)
    );
};

/**
 * Every consumer this process has asked to register, keyed by queue name so a queue asked for
 * twice replaces its binding rather than doubling it. `registerWorkers` calls
 * {@link consumeFromQueue} exactly once at boot, but {@link setupChannel} re-runs this map onto
 * every fresh channel amqplib's recovery hands back, boot's own included — that is what makes a
 * broker restart survivable without this process ever being restarted itself.
 */
const consumerBindings = new Map<string, (ch: ConfirmChannel) => Promise<void>>();

/**
 * Re-binds every known consumer onto a freshly opened channel — see {@link consumerBindings}.
 *
 * SERIALLY, not `Promise.all`: each binding's own `assertQueue` → `prefetch` (AMQP `basic.qos`) →
 * `consume` runs on the one shared channel, and `basic.qos` applies to the NEXT `basic.consume`
 * issued on that channel — not to the binding that called it. Two bindings running concurrently
 * can interleave their calls in either order, so one consumer's `prefetch` can silently apply to
 * ANOTHER consumer's `consume` instead of its own. A plain `for` loop, awaited one binding at a
 * time, keeps each binding's three calls adjacent on the wire.
 */
const replayConsumers = async (ch: ConfirmChannel): Promise<void> => {
    for (const bind of consumerBindings.values()) {
        await bind(ch);
    }
};

/**
 * Register a consumer on a queue. No-op when RabbitMQ is not configured.
 *
 * Recorded in {@link consumerBindings} regardless of whether a channel is available right now — a
 * broker still down means nothing to bind onto yet, not never: {@link setupChannel} replays it
 * the moment amqplib's recovery reaches a channel, first connect or reconnect alike.
 */
export const consumeFromQueue = <TPayload = unknown>(
    options: ConsumeOptions<TPayload>
): Promise<void> => {
    consumerBindings.set(options.queue, (ch) => bindConsumer(ch, options));
    const ch = getChannel();
    return ch ? bindConsumer(ch, options) : Promise.resolve();
};
