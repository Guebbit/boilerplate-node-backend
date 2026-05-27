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

const handleChatMessageAudit = (payload: unknown): Promise<void> => {
    const chatMessage = payload as IChatMessagePayload;
    auditLogger.info('kafka.chat.message', {
        action: CHAT_CHANNELS.EVENT_MESSAGE_NEW,
        username: chatMessage?.payload?.username,
        room: chatMessage?.payload?.room
    });
    return Promise.resolve();
};

const handleCartCheckoutAudit = (payload: unknown): Promise<void> => {
    const checkout = payload as ICartCheckedOutEvent;
    auditLogger.info('kafka.cart.checked_out', {
        action: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
        eventId: checkout?.eventId,
        userId: checkout?.userId,
        orderId: checkout?.orderId
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
