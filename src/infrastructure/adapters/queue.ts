/**
 * RabbitMQ (AMQP 0-9-1) adapter.
 *
 * Like the cache adapter, every function degrades to a no-op when the broker is not
 * configured — `publishToQueue` returns `false` and callers fall back to doing the work
 * inline (see `adapters/mailer.ts` → `enqueueEmail`).
 *
 * See: docs/tools/rabbitmq.md
 */

// `amqplib` is the AMQP 0-9-1 client. Key concepts used below:
//  - `ChannelModel` — the TCP *connection* to the broker (expensive; one per process).
//  - `Channel` — a lightweight multiplexed session inside that connection; all commands
//    (assertQueue/sendToQueue/consume/ack) are issued on a channel, never on the connection.
//  - `ConsumeMessage` — a delivered message: `.content` (Buffer) plus delivery metadata,
//    including the delivery tag that `ack`/`nack` reference.
import type { EventEmitter } from 'node:events';
import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { logger } from '@infrastructure/adapters/logger';
import type { DependencyStatus } from '@infrastructure/observability/dependency-health';
import { WORKER_CHANNELS } from '@types';

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
    Boolean(getAmqpUrl()) && process.env.NODE_RABBITMQ_ENABLED !== '0';

// ─── Connection state ─────────────────────────────────────────────────────────

/** The single TCP connection to the broker. Kept so shutdown can close it. */
let connection: ChannelModel | undefined;

/** Shared channel for all publish/consume traffic in this process. */
let channel: Channel | undefined;

/** In-flight connect, shared by concurrent callers to avoid a connection storm. */
let connectPromise: Promise<Channel | undefined> | undefined;

/**
 * What this adapter's connection is doing, for `GET /observability/health`.
 *
 * The channel handle IS the readiness signal: every publish and every consume is issued on it, and
 * `superviseHandle` clears it on the channel's OWN close as well as the connection's, so a live
 * handle means the next `publishToQueue` will reach the broker. No `checkQueue` round trip — see
 * the header of `infrastructure/observability/dependency-health.ts` for why a health endpoint does
 * no I/O.
 */
export const queueState = (): DependencyStatus => {
    if (!isQueueEnabled()) return 'disabled';
    if (channel) return 'ready';
    if (connectPromise) return 'connecting';
    return 'unavailable';
};

/** One-shot flag so an unreachable broker does not log once per publish. */
let connectionWarningLogged = false;

/** Log the first failure only; reset on a successful connect so later outages are visible. */
const logConnectionWarning = (error: unknown) => {
    if (connectionWarningLogged) return;
    // One line, not one per publish: an unreachable broker would otherwise flood the log.
    logger.warn({
        message: 'RabbitMQ unavailable, queue operations will be skipped.',
        error: error instanceof Error ? error.message : String(error)
    });
    connectionWarningLogged = true;
};

/**
 * Attach the mandatory `error` and `close` listeners to an amqplib handle.
 *
 * Both the connection and the channel are EventEmitters that fail independently, and an unhandled
 * `error` on either takes the process down. One helper so the pair cannot be attached to one and
 * forgotten on the other. `onClose` drops the cached reference: that is the whole reconnect
 * strategy, driven by demand.
 *
 * @param handle - the connection or channel to supervise
 * @param onClose - what to forget when it closes
 */
const superviseHandle = (handle: EventEmitter, onClose: () => void): void => {
    handle.on('error', logConnectionWarning);
    handle.on('close', onClose);
};

// ─── Connection management ────────────────────────────────────────────────────

/**
 * Lazily connect to RabbitMQ and return a shared channel.
 *
 * Resolving with `void` (instead of rejecting) is what makes every public function in this
 * file a safe no-op when the broker is absent.
 */
const getChannel = (): Promise<Channel | undefined> => {
    if (!isQueueEnabled()) return Promise.resolve(undefined);
    // Reuse the live channel — creating one per publish leaks channels on the broker.
    if (channel) return Promise.resolve(channel);
    // Join an in-flight attempt rather than opening a second connection.
    if (connectPromise) return connectPromise;

    const url = getAmqpUrl();
    if (!url) return Promise.resolve(undefined);

    const attempt: Promise<Channel | undefined> = amqplib
        // Opens the TCP connection and performs the AMQP handshake (auth + vhost negotiation).
        .connect(url)
        .then((conn) => {
            connection = conn;
            // A dead connection takes its channels with it, so both handles are forgotten here.
            superviseHandle(conn, () => {
                channel = undefined;
                connection = undefined;
            });
            // Channels are cheap and multiplexed over the one connection; this is where all
            // actual AMQP commands are issued.
            return conn.createChannel();
        })
        .then((ch) => {
            channel = ch;
            // A channel dies on its own for ordinary reasons — most of them named by
            // `assertJobQueue` below — and the connection stays open when it does. Without this,
            // the cached handle survives as a corpse whose every method throws, and
            // `queueState()` keeps reporting `ready`.
            superviseHandle(ch, () => {
                channel = undefined;
            });
            // Connection is healthy again — re-arm the warning for a future outage.
            connectionWarningLogged = false;
            return ch;
        })
        .catch((error: unknown) => {
            // Swallow: publish/consume callers treat undefined as "queue unavailable".
            logConnectionWarning(error);
            return undefined;
        })
        .finally(() => {
            // Always clear, so a failed attempt does not poison subsequent calls.
            connectPromise = undefined;
        });

    connectPromise = attempt;

    return attempt;
};

/**
 * Warm up RabbitMQ connection during app startup.
 * Pays the handshake cost at boot instead of on the first user request.
 */
export const startQueue = (): Promise<void> => getChannel().then(() => undefined);

/**
 * Gracefully close the RabbitMQ connection.
 *
 * Closing the connection implicitly closes its channels, so there is no separate
 * `channel.close()` here.
 */
export const stopQueue = (): Promise<void> => {
    const conn = connection;
    if (!conn) return Promise.resolve();

    return (
        conn
            // Flushes pending frames, then closes. Unacked messages are requeued by the broker
            // for another consumer — the reason `prefetch` is kept low (see `consumeFromQueue`).
            .close()
            // Already-dead socket: nothing to salvage, and we are exiting anyway.
            .catch(() => undefined)
            .finally(() => {
                channel = undefined;
                connection = undefined;
                connectPromise = undefined;
            })
    );
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
export const PDF_QUEUE = WORKER_CHANNELS.PDF_GENERATE;

// ─── Dead letters ─────────────────────────────────────────────────────────────

/**
 * The exchange every refused message is routed to, so `nack(msg, false, false)` means "moved for a
 * human" rather than "destroyed". `direct`, so each queue dead-letters under its own routing key.
 */
export const DEAD_LETTER_EXCHANGE = 'dead-letter';

/**
 * The dead-letter queue for a work queue, and the routing key that reaches it. Derived, so a queue
 * added to `WORKER_CHANNELS` gets its dead letters without a second registration.
 *
 * @param queue - the work queue
 * @returns the name of the queue its refusals land in
 */
export const deadLetterQueueOf = (queue: string): string => `${queue}.dead`;

/**
 * Declare a work queue, its dead-letter queue, and the binding between them.
 *
 * Idempotent, and called on both the publish and consume paths so producer and consumer may start
 * in any order. The dead-letter queue is bound BEFORE the work queue names the exchange: a queue
 * whose `x-dead-letter-exchange` resolves to nothing drops the message anyway.
 *
 * `assertQueue` throws `PRECONDITION_FAILED` when a queue already exists with different arguments,
 * which kills the channel — see `docs/tools/rabbitmq.md` for upgrading an existing broker.
 *
 * @param ch - the channel to declare on
 * @param queue - the work queue
 * @param durable - whether the definitions survive a broker restart
 */
const assertJobQueue = (ch: Channel, queue: string, durable: boolean): Promise<void> =>
    ch
        .assertExchange(DEAD_LETTER_EXCHANGE, 'direct', { durable: true })
        .then(() => ch.assertQueue(deadLetterQueueOf(queue), { durable: true }))
        .then(() =>
            ch.bindQueue(deadLetterQueueOf(queue), DEAD_LETTER_EXCHANGE, deadLetterQueueOf(queue))
        )
        .then(() =>
            ch.assertQueue(queue, {
                // `durable` = the queue definition survives a broker restart.
                durable,
                deadLetterExchange: DEAD_LETTER_EXCHANGE,
                deadLetterRoutingKey: deadLetterQueueOf(queue)
            })
        )
        .then(() => undefined);

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface PublishOptions<TPayload = unknown> {
    /** Queue name to publish to. */
    queue: string;
    /** Message payload (will be JSON-serialized). */
    payload: TPayload;
    /** Make queue survive broker restarts. Default: true. */
    durable?: boolean;
    /** Make message persistent. Default: true. */
    persistent?: boolean;
}

/**
 * Publish a message to a queue.
 * No-op when RabbitMQ is not configured.
 *
 * @returns `true` when the broker accepted the message, `false` when the queue is
 *          unavailable — callers use this to decide whether to fall back to inline work.
 *
 * Publishes to the *default exchange* (empty name), where the routing key is taken as a
 * literal queue name — the simplest AMQP topology there is. The only exchange this file declares
 * is the dead-letter one, which the broker uses on the way OUT of a queue, never on the way in.
 *
 * `TPayload` is the job envelope. A producer that names it — `publishToQueue<EmailJob>(…)` in
 * `enqueueEmail` — gets the same type checked here that its consumer declares, so a field added
 * on one side and forgotten on the other is a compile error rather than a message the worker
 * discards at 3am. Left inferred it defaults to `unknown`, which costs a caller nothing.
 */
export const publishToQueue = <TPayload = unknown>(
    options: PublishOptions<TPayload>
): Promise<boolean> =>
    getChannel().then((ch) => {
        if (!ch) return false;

        // Destructure with defaults here (rather than in the interface) so both call paths —
        // explicit options and omitted options — go through the same durable-by-default choice.
        const { queue, payload, durable = true, persistent = true } = options;

        return (
            assertJobQueue(ch, queue, durable)
                .then(() =>
                    // `sendToQueue(queue, content, options)` — content must be a Buffer, so the
                    // payload is JSON-serialized here and parsed back in `consumeFromQueue`.
                    ch.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
                        // `persistent` = the *message* is written to disk. Both this and a
                        // `durable` queue are required to survive a restart: a durable queue
                        // with transient messages comes back empty.
                        persistent
                    })
                )
                // `sendToQueue` returns a boolean: false means amqplib's internal write buffer is
                // full (backpressure) and the caller should wait for the channel's 'drain' event.
                // This is surfaced to the caller as-is rather than handled.
                //
                // The catch is the declared contract: a channel that died since the cached-handle
                // check rejects here, and every caller reads a boolean.
                .catch((error: unknown) => {
                    logConnectionWarning(error);
                    return false;
                })
        );
    });

// ─── Consume ──────────────────────────────────────────────────────────────────

export interface ConsumeOptions<TPayload = unknown> {
    /** Queue name to consume from. */
    queue: string;
    /** Handler called for each message. Return true to ack, false to nack. */
    handler: (message: TPayload, raw: ConsumeMessage) => Promise<boolean>;
    /** Make queue survive broker restarts. Default: true. */
    durable?: boolean;
    /** Number of unacknowledged messages allowed at once. Default: 1. */
    prefetch?: number;
}

/**
 * Register a consumer on a queue.
 * No-op when RabbitMQ is not configured.
 *
 * Acknowledgement policy, which is the important part of this function:
 *  - handler resolves `true`  → `ack`  — done, broker deletes the message
 *  - handler resolves `false` → `nack` without requeue — permanent business rejection
 *  - handler *throws*         → `nack` with requeue — assumed transient, try again
 *  - unparseable message      → `nack` without requeue — will never parse, so requeuing loops
 *
 * Both `nack`-without-requeue arms route to `DEAD_LETTER_EXCHANGE`, so "discard" means "moved to
 * `<queue>.dead`", not "deleted".
 *
 * Caveat: requeue-on-throw spins hot if the failure is actually permanent — bounded by `prefetch`,
 * and loud rather than silent.
 *
 * `TPayload` is inferred from the handler, which is how a worker gets to declare its own job type
 * (`handleEmailJob(job: Partial<EmailJob>)`) instead of taking `unknown` and asserting its way
 * back to it. The type is a *claim about the wire*, never a check — see the assertion below.
 */
export const consumeFromQueue = <TPayload = unknown>(
    options: ConsumeOptions<TPayload>
): Promise<void> =>
    getChannel().then((ch) => {
        if (!ch) return;

        const { queue, handler, durable = true, prefetch = 1 } = options;

        return (
            // Same idempotent declaration as on the publish side — the consumer may boot first.
            assertJobQueue(ch, queue, durable)
                // `prefetch` (AMQP basic.qos) caps unacked messages per consumer. With 1, the
                // broker hands over the next message only after the current one is acked, which
                // gives fair round-robin across replicas instead of one worker hoarding a batch.
                .then(() => ch.prefetch(prefetch))
                .then(() =>
                    // `consume` registers the callback and returns a consumerTag (unused here,
                    // since the consumer lives for the whole process lifetime).
                    ch.consume(queue, (incoming) => {
                        // `null` is delivered when the consumer is cancelled broker-side
                        // (queue deleted, channel closing) — nothing to ack.
                        if (!incoming) return;

                        let parsed: unknown;
                        // eslint-disable-next-line no-restricted-syntax -- JSON.parse has no non-throwing form; a malformed message is dropped, not a crash
                        try {
                            // `.content` is a Buffer; `toString()` assumes UTF-8 JSON, matching
                            // what `publishToQueue` writes.
                            parsed = JSON.parse(incoming.content.toString());
                        } catch {
                            // Malformed message — reject without requeue.
                            // `nack(message, allUpTo, requeue)`: allUpTo=false rejects only this
                            // delivery, requeue=false discards it. Requeuing would loop forever
                            // since the bytes will never become valid JSON.
                            logger.warn({ message: 'Queue message parse failed, nacking.', queue });
                            ch.nack(incoming, false, false);
                            return;
                        }

                        /*
                         * The one assertion in this pipeline, and the only place it belongs: this
                         * is where bytes become a value, so it is the only line that can lie about
                         * the shape. `JSON.parse` cannot know `TPayload`, and no generic makes it
                         * know — the handler is still responsible for checking the fields it needs
                         * before using them, which is why the workers narrow with a predicate and
                         * declare their payload `Partial<…>` rather than fully-formed.
                         *
                         * Keeping it here means it happens once, at the boundary, instead of once
                         * per worker in code that has no idea where the value came from.
                         */
                        // The handler's boolean *is* the ack decision — see the policy above.
                        handler(parsed as TPayload, incoming)
                            .then((ack) => {
                                // `ack` removes the message from the queue permanently.
                                if (ack) ch.ack(incoming);
                                // Handled but refused: drop it (requeue=false).
                                else ch.nack(incoming, false, false);
                            })
                            // Thrown error = presumed transient (DB down, SMTP timeout), so
                            // requeue=true puts it back for another attempt.
                            .catch(() => ch.nack(incoming, false, true));
                    })
                )
                // Discard the consumerTag reply; callers only need "consumer registered".
                .then(() => undefined)
        );
    });
