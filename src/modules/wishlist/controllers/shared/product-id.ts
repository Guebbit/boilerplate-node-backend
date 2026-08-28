/**
 * The one guard all three writing wishlist controllers repeat, written once.
 *
 * `POST /wishlist`, `DELETE /wishlist/:productId` and `POST /wishlist/:productId/move-to-cart`
 * each carried a byte-identical `isValidObjectId` branch and a byte-identical three-line comment
 * explaining it. Three copies of one rule is three places to change it, and the comment is the
 * half that would have gone stale first.
 *
 * ── Why the controller layer, and not the service ─────────────────────────────────────────────
 * `Id` is a plain string in the contract — a backend is free to use ULIDs — so "24 hex characters"
 * is a fact about THIS deployment's store rather than about the wishlist, and `probes.ts` records
 * that boundary as the thing `DELETE /wishlist/not-an-object-id` exists to prove. It is also the
 * only place the distinction survives: the service answers 404 for a line the caller does not
 * hold, and a malformed id has to be a different answer from an absent one, or a client cannot
 * tell a stale view from a bug in its own code.
 *
 * ── Why not `extractAndValidateId` ────────────────────────────────────────────────────────────
 * `@infrastructure/http/request` already owns this idea, and it resolves the key `id` through
 * `readInput`. Every wishlist route names its id `productId` — in the path for two of them, in the
 * validated body for the third — so that helper would look for a field none of them sends. Same
 * contract, though, and deliberately: like `extractAndValidateId` and `parseBody`, this RESPONDS
 * as well as decides, so the caller must stop without touching the response again.
 */

import type { Response } from 'express';
import { t } from '@infrastructure/i18n';
import { isValidObjectId } from '@infrastructure/http/request';
import { rejectResponse } from '@infrastructure/http/response';

/**
 * Answer 422 when a product id is not one Mongo could build, and say whether it did.
 *
 * `if (malformedProductId(response, productId)) return;` — the shape `refused()` has in
 * `@infrastructure/http/controller`, for the same reason: the branch is the whole helper, and the
 * `return` stays at the call site where a reader can see the handler stop.
 *
 * @param response - the express response, used only on failure
 * @param productId - the id as it arrived, from the path or from the parsed body
 * @returns `true` when 422 has been sent and the caller must stop
 */
export const malformedProductId = (response: Response, productId: string | undefined): boolean => {
    if (isValidObjectId(productId)) return false;

    // 422 rather than 404: the request is syntactically fine and its value is unusable, which is
    // what tells a caller the id was malformed rather than merely absent from their wishlist.
    rejectResponse(response, 422, [t('generic.error-missing-data')]);
    return true;
};
