import { ECOMMERCE_CHANNELS, type ICartCheckedOutEvent } from '@types';
import { domainEvents } from '@utils/domain-events';
import { publishKafkaMessage } from '@utils/kafka';

let isSubscribed = false;
let currentHandler: EventListener | undefined;

// Bridge in-process domain events to Kafka while keeping local EventTarget behavior.
export const registerDomainEventsKafkaBridge = () => {
    if (isSubscribed) return;

    currentHandler = (event) => {
        const payload = (event as CustomEvent<ICartCheckedOutEvent>).detail;
        void publishKafkaMessage({
            channel: ECOMMERCE_CHANNELS.CART_CHECKED_OUT,
            payload,
            key: payload?.userId
        });
    };
    domainEvents.addEventListener(ECOMMERCE_CHANNELS.CART_CHECKED_OUT, currentHandler);
    isSubscribed = true;
};

// Test helper and graceful-reload safety.
export const unregisterDomainEventsKafkaBridge = () => {
    if (!isSubscribed || !currentHandler) return;
    domainEvents.removeEventListener(ECOMMERCE_CHANNELS.CART_CHECKED_OUT, currentHandler);
    isSubscribed = false;
    currentHandler = undefined;
};
