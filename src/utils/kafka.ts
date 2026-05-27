import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { logger } from '@utils/winston';

// Kafka is optional by design: if brokers are not configured, all helpers no-op.
const getKafkaBrokers = (): string[] => {
    const raw = process.env.NODE_KAFKA_BROKERS?.trim();
    if (raw)
        return raw
            .split(',')
            .map((broker) => broker.trim())
            .filter(Boolean);

    if (!process.env.NODE_KAFKA_PORT) return [];
    const host = process.env.NODE_KAFKA_HOST ?? '127.0.0.1';
    return [`${host}:${process.env.NODE_KAFKA_PORT}`];
};

export const isKafkaEnabled = (): boolean => {
    logHostWithoutPortWarning();
    return getKafkaBrokers().length > 0 && process.env.NODE_KAFKA_ENABLED !== '0';
};

const getKafkaClientId = () => process.env.NODE_KAFKA_CLIENT_ID ?? 'boilerplate-node-backend';
const getKafkaTopicPrefix = () => process.env.NODE_KAFKA_TOPIC_PREFIX?.trim() ?? '';
const toTopicName = (channelName: string) =>
    getKafkaTopicPrefix() ? `${getKafkaTopicPrefix()}.${channelName}` : channelName;

let kafkaClient: Kafka | undefined;
let producer: Producer | undefined;
let producerConnectPromise: Promise<Producer | void> | undefined;
let connectionWarningLogged = false;
let hostWithoutPortWarningLogged = false;
const activeConsumers = new Set<Consumer>();

const getClient = (): Kafka | undefined => {
    if (!isKafkaEnabled()) return;
    if (!kafkaClient) {
        kafkaClient = new Kafka({
            clientId: getKafkaClientId(),
            brokers: getKafkaBrokers(),
            logLevel: logLevel.NOTHING
        });
    }
    return kafkaClient;
};

const logHostWithoutPortWarning = () => {
    if (hostWithoutPortWarningLogged) return;
    if (process.env.NODE_KAFKA_BROKERS?.trim()) return;
    const hasHost = Boolean(process.env.NODE_KAFKA_HOST?.trim());
    const hasPort = Boolean(process.env.NODE_KAFKA_PORT?.trim());
    if (!hasHost || hasPort) return;
    logger.warn({
        message: 'Kafka host is configured without NODE_KAFKA_PORT; Kafka is disabled.',
        host: process.env.NODE_KAFKA_HOST
    });
    hostWithoutPortWarningLogged = true;
};

const logConnectionWarning = (error: unknown) => {
    if (connectionWarningLogged) return;
    logger.warn({
        message: 'Kafka unavailable, kafka operations will be skipped.',
        error: error instanceof Error ? error.message : String(error)
    });
    connectionWarningLogged = true;
};

const getProducer = (): Promise<Producer | void> => {
    const client = getClient();
    if (!client) return Promise.resolve();
    if (producer) return Promise.resolve(producer);
    if (producerConnectPromise) return producerConnectPromise;

    const localProducer = client.producer();
    producerConnectPromise = localProducer
        .connect()
        .then(() => {
            producer = localProducer;
            connectionWarningLogged = false;
            return localProducer;
        })
        .catch((error: unknown) => {
            logConnectionWarning(error);
            return;
        })
        .finally(() => {
            producerConnectPromise = undefined;
        });

    return producerConnectPromise;
};

export const startKafka = (): Promise<void> => getProducer().then(() => {});

export const stopKafka = (): Promise<void> => {
    const disconnectConsumers = [...activeConsumers].map((consumer) =>
        consumer.disconnect().catch(() => {})
    );
    activeConsumers.clear();

    const disconnectProducer = producer?.disconnect().catch(() => {});

    return Promise.all([...disconnectConsumers, disconnectProducer])
        .then(() => {})
        .finally(() => {
            producer = undefined;
            producerConnectPromise = undefined;
            kafkaClient = undefined;
        });
};

export interface IKafkaPublishOptions {
    channel: string;
    payload: unknown;
    key?: string;
}

export const publishKafkaMessage = (options: IKafkaPublishOptions): Promise<boolean> =>
    getProducer().then((activeProducer) => {
        if (!activeProducer) return false;
        const { channel, payload, key } = options;
        return activeProducer
            .send({
                topic: toTopicName(channel),
                messages: [
                    {
                        key,
                        value: JSON.stringify(payload)
                    }
                ]
            })
            .then(() => true)
            .catch((error: unknown) => {
                logConnectionWarning(error);
                return false;
            });
    });

export interface IKafkaConsumeOptions {
    channel: string;
    groupId: string;
    handler: (payload: unknown, metadata: { channel: string; partition: number }) => Promise<void>;
}

export const consumeKafkaMessage = (options: IKafkaConsumeOptions): Promise<void> => {
    const client = getClient();
    if (!client) return Promise.resolve();

    const consumer = client.consumer({ groupId: options.groupId });
    activeConsumers.add(consumer);
    const topic = toTopicName(options.channel);

    return consumer
        .connect()
        .then(() => consumer.subscribe({ topic }))
        .then(() =>
            consumer.run({
                eachMessage: ({ partition, message }) => {
                    if (!message.value) return Promise.resolve();

                    let payload: unknown;
                    try {
                        payload = JSON.parse(message.value.toString());
                    } catch {
                        logger.warn({
                            message: 'Kafka message parse failed, skipping.',
                            topic
                        });
                        return Promise.resolve();
                    }

                    return options.handler(payload, {
                        channel: options.channel,
                        partition
                    });
                }
            })
        )
        .catch((error: unknown) => {
            logConnectionWarning(error);
            return;
        });
};
