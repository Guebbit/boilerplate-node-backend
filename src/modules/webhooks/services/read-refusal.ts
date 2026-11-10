/**
 * @module
 * The one refusal for "you may not receive that event": shared by every write that hands an event
 * stream to a receiver (create, update, secret rotation) and by replay.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { ERROR_CODES } from '@api/error-codes';

/**
 * A 403 `WEBHOOK_EVENT_READ_REQUIRED` naming the events the caller may not read.
 *
 * @param names - the unreadable event names, from `unreadableEventTypes`
 */
export const rejectEventReadRequired = (names: readonly string[]): ResponseReject =>
    generateReject(403, [
        {
            code: ERROR_CODES.WEBHOOK_EVENT_READ_REQUIRED,
            message: t('webhooks.event-read-required', { names: names.join(', ') })
        }
    ]);
