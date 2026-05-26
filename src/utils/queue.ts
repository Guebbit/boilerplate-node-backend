import amqplib, { type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { logger } from './winston';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Build the AMQP connection URL from env vars. */
const getAmqpUrl = (): string | undefined => {
    if (process.env.NODE_RABBITMQ_URL) return process.env.NODE_RABBITMQ_URL;
    if (!process.env.NODE_RABBITMQ_PORT) return;

    const host = process.env.NODE_RABBITMQ_HOST ?? '127.0.0.1';
    const port = process.env.NODE_RABBITMQ_PORT;
    const user = process.env.NODE_RABBITMQ_USER ?? 'guest';
    const pass = process.env.NODE_RABBITMQ_PASS ?? 'guest';
    return `amqp://${user}:${pass}@${host}:${port}`;
};

/** Returns true when RabbitMQ is configured and not explicitly disabled. */
export const isQueueEnabled = (): boolean =>
    Boolean(getAmqpUrl()) && process.env.NODE_RABBITMQ_ENABLED !== '0';

// ─── Connection state ─────────────────────────────────────────────────────────

let connection: ChannelModel | undefined;
let channel: Channel | undefined;
let connectPromise: Promise<Channel | void> | undefined;
let connectionWarningLogged = false;

const logConnectionWarning = (error: unknown) => {
    if (connectionWarningLogged) return;
    logger.warn({
        message: 'RabbitMQ unavailable, queue operations will be skipped.',
        error: error instanceof Error ? error.message : String(error)
    });
    connectionWarningLogged = true;
};

// ─── Connection management ────────────────────────────────────────────────────

/** Lazily connect to RabbitMQ and return a shared channel. */
const getChannel = (): Promise<Channel | void> => {
    if (!isQueueEnabled()) return Promise.resolve();
    if (channel) return Promise.resolve(channel);
    if (connectPromise) return connectPromise;

    const url = getAmqpUrl();
    if (!url) return Promise.resolve();

    connectPromise = amqplib
        .connect(url)
        .then((conn) => {
            connection = conn;
            connection.on('error', logConnectionWarning);
            connection.on('close', () => {
                channel = undefined;
                connection = undefined;
            });
            return conn.createChannel();
        })
        .then((ch) => {
            channel = ch;
            connectionWarningLogged = false;
            return ch;
        })
        .catch((error: unknown) => {
            logConnectionWarning(error);
            return;
        })
        .finally(() => {
            connectPromise = undefined;
        });

    return connectPromise;
};

/** Warm up RabbitMQ connection during app startup. */
export const startQueue = (): Promise<void> => getChannel().then(() => {});

/** Gracefully close the RabbitMQ connection. */
export const stopQueue = (): Promise<void> => {
    const conn = connection;
    if (!conn) return Promise.resolve();

    return conn
        .close()
        .catch(() => {})
        .finally(() => {
            channel = undefined;
            connection = undefined;
            connectPromise = undefined;
        });
};

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface IPublishOptions {
    /** Queue name to publish to. */
    queue: string;
    /** Message payload (will be JSON-serialized). */
    payload: unknown;
    /** Make queue survive broker restarts. Default: true. */
    durable?: boolean;
    /** Make message persistent. Default: true. */
    persistent?: boolean;
}

/**
 * Publish a message to a queue.
 * No-op when RabbitMQ is not configured.
 */
export const publishToQueue = (options: IPublishOptions): Promise<boolean> =>
    getChannel().then((ch) => {
        if (!ch) return false;

        const { queue, payload, durable = true, persistent = true } = options;

        return ch.assertQueue(queue, { durable }).then(() =>
            ch.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
                persistent
            })
        );
    });

// ─── Consume ──────────────────────────────────────────────────────────────────

export interface IConsumeOptions {
    /** Queue name to consume from. */
    queue: string;
    /** Handler called for each message. Return true to ack, false to nack. */
    handler: (message: unknown, raw: ConsumeMessage) => Promise<boolean>;
    /** Make queue survive broker restarts. Default: true. */
    durable?: boolean;
    /** Number of unacknowledged messages allowed at once. Default: 1. */
    prefetch?: number;
}

/**
 * Register a consumer on a queue.
 * No-op when RabbitMQ is not configured.
 */
export const consumeFromQueue = (options: IConsumeOptions): Promise<void> =>
    getChannel().then((ch) => {
        if (!ch) return;

        const { queue, handler, durable = true, prefetch = 1 } = options;

        return ch
            .assertQueue(queue, { durable })
            .then(() => ch.prefetch(prefetch))
            .then(() =>
                ch.consume(queue, (incoming) => {
                    if (!incoming) return;

                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(incoming.content.toString());
                    } catch {
                        // Malformed message — reject without requeue.
                        logger.warn({ message: 'Queue message parse failed, nacking.', queue });
                        ch.nack(incoming, false, false);
                        return;
                    }

                    handler(parsed, incoming)
                        .then((ack) => {
                            if (ack) ch.ack(incoming);
                            else ch.nack(incoming, false, false);
                        })
                        .catch(() => ch.nack(incoming, false, true));
                })
            )
            .then(() => {});
    });
