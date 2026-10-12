/**
 * @module
 * What `forced: true` asks of a caller. One rule for both doors that accept it (ship and deliver),
 * so they cannot drift on what "forced" requires.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { holdsKey } from '@kernel/ability';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';

/**
 * A `forced: true` caller must hold `orders.any.override` (the route's own `delivery.any.update`
 * gate is not enough — forcing is a second, stricter permission) and must give a `reason`.
 * @param context - the caller
 * @param forced - the request body's own flag
 * @param reason - the request body's own reason, required exactly when `forced` is `true`
 * @returns a 403/422 reject if forcing was asked for but not earned, `undefined` otherwise
 */
export const refuseUnearnedForce = (
    context: CallerContext,
    forced: boolean | undefined,
    reason: string | undefined
): ResponseReject | undefined => {
    if (!forced) return undefined;
    if (!holdsKey(context.caller, 'orders.any.override'))
        return generateReject(403, [
            { code: ERROR_CODES.FORBIDDEN, message: t('generic.error-forbidden') }
        ]);
    if (!reason)
        return generateReject(422, [
            {
                code: ERROR_CODES.DELIVERY_OVERRIDE_REASON_REQUIRED,
                message: t('delivery.override-reason-required')
            }
        ]);
    return undefined;
};
