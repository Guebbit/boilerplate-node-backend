/**
 * @module
 * The one refusal every "this order can no longer be paid" case answers with — a leaf on purpose:
 * no persistence import, so every file in `services/` can reach it without adding an edge to
 * anything else here.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';

/**
 * The order failed `@modules/orders`' `isPayable` check before any write, or it moved out from
 * under a race between that check and the write, or the money bounced straight back because the
 * order was gone by the time it landed. Same code and message regardless of which of the three
 * caught it — a client cannot tell them apart and doesn't need to.
 */
export const notPayable = (): ResponseReject =>
    generateReject(409, [{ code: 'PAYMENT_ORDER_NOT_PAYABLE', message: t('payments.order-not-payable') }]);
