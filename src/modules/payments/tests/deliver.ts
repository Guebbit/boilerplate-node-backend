/**
 * @module
 * Delivers a provider event to the payments service the way the webhook route does: signed, then
 * through `receiveWebhook`. The unsigned step beneath it is not on the service object, so a test
 * that wants an event applied goes through the same door a provider does.
 */

import { signFakeDelivery } from '@scenarios/support/doubles/payments/fake';
import type { ProviderWebhookEvent } from '../providers';
import { paymentService } from '../services';

/**
 * Sign `event` and hand it to the service's webhook door.
 *
 * @param event - the event the provider would send
 * @param providerName - the endpoint it arrives at; the fake provider's by default
 * @returns resolves once applied; rejects as the route would answer (a refused signature, an
 *   event the schema refuses, an unknown provider name)
 */
export const deliver = (event: ProviderWebhookEvent, providerName = 'fake'): Promise<void> => {
    const { body, headers } = signFakeDelivery(event);
    return paymentService.receiveWebhook(providerName, Buffer.from(body), headers);
};
