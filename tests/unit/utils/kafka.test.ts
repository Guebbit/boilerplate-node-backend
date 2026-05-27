let mockProducerSend: jest.Mock;
let mockProducerConnect: jest.Mock;
let mockProducerDisconnect: jest.Mock;
let mockProducer: jest.Mock;
let mockConsumerConnect: jest.Mock;
let mockConsumerSubscribe: jest.Mock;
let mockConsumerRun: jest.Mock;
let mockConsumerDisconnect: jest.Mock;
let mockConsumer: jest.Mock;

jest.mock('kafkajs', () => {
    mockProducerSend = jest.fn().mockResolvedValue([{ topicName: 'topic', partition: 0 }]);
    mockProducerConnect = jest.fn().mockImplementation(() => Promise.resolve());
    mockProducerDisconnect = jest.fn().mockImplementation(() => Promise.resolve());
    mockProducer = jest.fn().mockReturnValue({
        connect: mockProducerConnect,
        send: mockProducerSend,
        disconnect: mockProducerDisconnect
    });

    mockConsumerConnect = jest.fn().mockImplementation(() => Promise.resolve());
    mockConsumerSubscribe = jest.fn().mockImplementation(() => Promise.resolve());
    mockConsumerRun = jest.fn().mockImplementation(() => Promise.resolve());
    mockConsumerDisconnect = jest.fn().mockImplementation(() => Promise.resolve());
    mockConsumer = jest.fn().mockReturnValue({
        connect: mockConsumerConnect,
        subscribe: mockConsumerSubscribe,
        run: mockConsumerRun,
        disconnect: mockConsumerDisconnect
    });

    return {
        Kafka: jest.fn().mockImplementation(() => ({
            producer: mockProducer,
            consumer: mockConsumer
        })),
        logLevel: {
            NOTHING: 0
        }
    };
});

import {
    consumeKafkaMessage,
    isKafkaEnabled,
    publishKafkaMessage,
    startKafka,
    stopKafka
} from '@utils/kafka';

const disableKafka = () => {
    delete process.env.NODE_KAFKA_ENABLED;
    delete process.env.NODE_KAFKA_BROKERS;
    delete process.env.NODE_KAFKA_HOST;
    delete process.env.NODE_KAFKA_PORT;
    delete process.env.NODE_KAFKA_TOPIC_PREFIX;
};

describe('kafka utils', () => {
    afterEach(() => {
        disableKafka();
        return stopKafka().then(() => {
            jest.clearAllMocks();
        });
    });

    it('returns false when brokers are not configured', () => {
        disableKafka();
        expect(isKafkaEnabled()).toBe(false);
    });

    it('returns true when NODE_KAFKA_BROKERS is set', () => {
        process.env.NODE_KAFKA_BROKERS = 'localhost:9092';
        expect(isKafkaEnabled()).toBe(true);
    });

    it('publishes a message when enabled', () => {
        process.env.NODE_KAFKA_BROKERS = 'localhost:9092';
        process.env.NODE_KAFKA_TOPIC_PREFIX = 'dev';

        return publishKafkaMessage({
            channel: 'ecommerce.cart.checked_out',
            payload: { id: '1' },
            key: 'user-1'
        }).then((sent) => {
            expect(sent).toBe(true);
            expect(mockProducerSend).toHaveBeenCalledWith({
                topic: 'dev.ecommerce.cart.checked_out',
                messages: [{ key: 'user-1', value: JSON.stringify({ id: '1' }) }]
            });
        });
    });

    it('registers a consumer when enabled', () => {
        process.env.NODE_KAFKA_BROKERS = 'localhost:9092';

        return consumeKafkaMessage({
            channel: 'realtime.chat.event.message.new',
            groupId: 'audit',
            handler: jest.fn().mockImplementation(() => Promise.resolve())
        }).then(() => {
            expect(mockConsumerConnect).toHaveBeenCalled();
            expect(mockConsumerSubscribe).toHaveBeenCalledWith({
                topic: 'realtime.chat.event.message.new'
            });
            expect(mockConsumerRun).toHaveBeenCalled();
        });
    });

    it('startKafka resolves when disabled', () =>
        startKafka().then(() => {
            expect(mockProducerConnect).not.toHaveBeenCalled();
        }));
});
