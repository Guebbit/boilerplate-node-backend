import { emitDomainEvent } from '@utils/domain-events';
import {
    registerDomainEventsKafkaBridge,
    unregisterDomainEventsKafkaBridge
} from '@utils/domain-events-kafka';
import { ECOMMERCE_CHANNELS } from '@types';

const mockPublishKafkaMessage = jest.fn().mockResolvedValue(true);

jest.mock('@utils/kafka', () => ({
    publishKafkaMessage: (...arguments_: unknown[]) => mockPublishKafkaMessage(...arguments_)
}));

describe('domain-events Kafka bridge', () => {
    afterEach(() => {
        unregisterDomainEventsKafkaBridge();
        jest.clearAllMocks();
    });

    it('forwards ecommerce.cart.checked_out to Kafka', () => {
        registerDomainEventsKafkaBridge();

        emitDomainEvent(ECOMMERCE_CHANNELS.CART_CHECKED_OUT, {
            eventName: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
            eventId: 'ev-1',
            occurredAt: new Date().toISOString(),
            cartId: 'cart-1',
            userId: 'user-1',
            orderId: 'order-1',
            itemCount: 2
        });

        expect(mockPublishKafkaMessage).toHaveBeenCalledWith({
            channel: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
            payload: expect.objectContaining({ userId: 'user-1' }),
            key: 'user-1'
        });
    });
});
