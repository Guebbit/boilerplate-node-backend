import {
    CHAT_CHANNELS,
    ECOMMERCE_CHANNELS,
    type ICartCheckedOutEvent,
    type IChatMessagePayload
} from '@types';
import { consumeKafkaMessage, isKafkaEnabled } from '@utils/kafka';
import { auditLogger, logger } from '@utils/winston';

// Demo consumers: useful as starter templates for analytics/audit pipelines.
const KAFKA_AUDIT_GROUP = process.env.NODE_KAFKA_AUDIT_GROUP ?? 'boilerplate-audit-group';

const isChatMessagePayload = (payload: unknown): payload is IChatMessagePayload => {
    const value = payload as IChatMessagePayload | undefined;
    return Boolean(
        value?.type === 'chat:message' &&
        value.payload?.username &&
        value.payload.room &&
        value.payload.message &&
        value.payload.id &&
        value.payload.timestamp
    );
};

const isCartCheckedOutEvent = (payload: unknown): payload is ICartCheckedOutEvent => {
    const value = payload as ICartCheckedOutEvent | undefined;
    return Boolean(
        value?.eventName === ECOMMERCE_CHANNELS.CART_CHECKED_OUT &&
        value.eventId &&
        value.occurredAt &&
        value.cartId &&
        value.userId &&
        value.orderId &&
        Number.isInteger(value.itemCount) &&
        value.itemCount > 0
    );
};

const handleChatMessageAudit = (payload: unknown): Promise<void> => {
    if (!isChatMessagePayload(payload)) {
        logger.warn({
            message: 'Kafka chat message payload is invalid; skipping audit log.'
        });
        return Promise.resolve();
    }

    const chatMessage = payload;
    auditLogger.info('kafka.chat.message', {
        action: CHAT_CHANNELS.EVENT_MESSAGE_NEW,
        username: chatMessage.payload.username,
        room: chatMessage.payload.room
    });
    return Promise.resolve();
};

const handleCartCheckoutAudit = (payload: unknown): Promise<void> => {
    if (!isCartCheckedOutEvent(payload)) {
        logger.warn({
            message: 'Kafka cart checkout payload is invalid; skipping audit log.'
        });
        return Promise.resolve();
    }

    const checkout = payload;
    auditLogger.info('kafka.cart.checked_out', {
        action: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
        eventId: checkout.eventId,
        userId: checkout.userId,
        orderId: checkout.orderId
    });
    return Promise.resolve();
};

export const registerKafkaWorkers = (): Promise<void> => {
    if (!isKafkaEnabled()) return Promise.resolve();

    logger.info('Registering Kafka workers...');
    return Promise.all([
        consumeKafkaMessage({
            channel: CHAT_CHANNELS.EVENT_MESSAGE_NEW,
            groupId: KAFKA_AUDIT_GROUP,
            handler: handleChatMessageAudit
        }),
        consumeKafkaMessage({
            channel: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
            groupId: KAFKA_AUDIT_GROUP,
            handler: handleCartCheckoutAudit
        })
    ]).then(() => {
        logger.info('Kafka workers registered.');
    });
};
