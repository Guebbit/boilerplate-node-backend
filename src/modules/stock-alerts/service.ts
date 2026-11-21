/**
 * @module
 * Back-in-stock requests: ask, cancel, list your own, and answer a product that is no longer
 * `out_of_stock` with one mail and one inbox row per waiting request, then delete the request.
 * The click on "Notify me" is the buyer's consent for that single mail, so nothing else is ever
 * sent on it.
 *
 * @see docs/modules/stock-alerts.md#the-story
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { getDefaultLocale } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { frontendLink } from '@infrastructure/http/frontend-link';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { announceInTransaction } from '@kernel/outbox';
import { inventoryService } from '@modules/inventory';
import { productPagePath, productService } from '@modules/products';
import { userService, isAuthenticatable } from '@modules/users';
import { ERROR_CODES } from '@api/error-codes';
import type { StockAlertsResponse } from '@types';
import { backInStockEmail } from './emails';
import { STOCK_ALERT_SENT } from './events';
import { stockAlertRepository, STOCK_ALERT_LIMIT_REACHED } from './repository';
import { presentStockAlerts } from './presenter';

/** A user's own requests, newest first. */
const list = (userId: string): Promise<StockAlertsResponse> =>
    stockAlertRepository.findByUserId(userId).then((alerts) => presentStockAlerts(alerts));

/**
 * Ask to be told when a product can be ordered again.
 *
 * Refused unless the product is `out_of_stock` (inventory's own read): the button is only offered
 * then, and a mail for something already on sale would be noise. Asking twice is the same
 * request. Refused with 409 `STOCK_ALERT_LIMIT_REACHED` for a NEW product once the account holds
 * `NODE_STOCK_ALERTS_MAX`.
 *
 * @see docs/modules/stock-alerts.md#the-cap
 * @param userId - the signed-in buyer
 * @param productId - the product they cannot order
 */
const ask = (
    userId: string,
    productId: string
): Promise<ResponseSuccess<StockAlertsResponse> | ResponseReject> =>
    productService.findPublicById(productId).then((product) => {
        if (!product) return generateReject(404, [t('stock-alerts.product-not-found')]);

        return inventoryService.availabilityOfProducts([productId]).then((states) => {
            if (states.get(productId) !== 'out_of_stock')
                return generateReject(409, [
                    {
                        code: ERROR_CODES.STOCK_ALERT_PRODUCT_BUYABLE,
                        message: t('stock-alerts.already-buyable')
                    }
                ]);

            return stockAlertRepository.ask(userId, productId).then((asked) =>
                asked === STOCK_ALERT_LIMIT_REACHED
                    ? generateReject(409, [
                          {
                              code: ERROR_CODES.STOCK_ALERT_LIMIT_REACHED,
                              message: t('stock-alerts.full')
                          }
                      ])
                    : list(userId).then((view) => generateSuccess(view, 200))
            );
        });
    });

/**
 * Cancel the caller's own request before it is answered.
 *
 * @param userId - the signed-in buyer
 * @param productId - the product they no longer want to hear about
 */
const cancel = (
    userId: string,
    productId: string
): Promise<ResponseSuccess<StockAlertsResponse> | ResponseReject> =>
    stockAlertRepository.cancel(userId, productId).then((removed) => {
        if (!removed) return generateReject(404, [t('stock-alerts.not-found')]);
        return list(userId).then((view) => generateSuccess(view, 200));
    });

/**
 * The caller's requests as stored, for the personal-data export.
 * @param userId - the account holder
 */
const exportRows = (userId: string): Promise<StockAlertsResponse['items']> =>
    list(userId).then(({ items }) => items);

/**
 * Erase an account's requests, in the caller's hard-delete transaction.
 * @param userId - the erased account
 * @param session - the deletion's transaction
 */
const removeByUserId = (userId: string, session: ClientSession): Promise<void> =>
    stockAlertRepository.deleteByUserId(userId, session);

/**
 * A product left the catalogue: nobody can be told about it, so its requests go.
 * @param productId - the deleted product
 */
const removeByProductId = (productId: string): Promise<void> =>
    stockAlertRepository.deleteByProductId(productId);

/**
 * The product name a buyer reads: their language, else the shop's, else any.
 * @param titles - the product's names by locale
 * @param locale - the buyer's language
 */
const titleFor = (titles: Record<string, string>, locale: string): string =>
    [
        ...[locale, getDefaultLocale()].map((wanted) => titles[wanted]),
        ...Object.values(titles)
    ].find(Boolean) ?? '';

/**
 * Answer one request: delete it and announce the inbox row in one transaction, then send the mail.
 * The delete is the guard, so a request canceled meanwhile, or answered by a redelivery of the
 * signal, finds nothing to delete and sends nothing.
 *
 * @param alert - the waiting request
 * @param titles - the product's names by locale
 * @returns whether this run answered it
 */
const answerOne = (
    alert: { id: string; userId: string; productId: string },
    titles: Record<string, string>
): Promise<boolean> =>
    announceInTransaction(
        (session) =>
            stockAlertRepository
                .deleteById(alert.id, session)
                .then((deleted) => (deleted ? alert : null)),
        (answered) => ({
            name: STOCK_ALERT_SENT,
            payload: { userId: answered.userId, productId: answered.productId, titles },
            aggregateId: answered.userId
        })
    ).then((answered) => {
        if (!answered) return false;
        return mailBuyer(answered.userId, answered.productId, titles).then(() => true);
    });

/**
 * Mail one buyer that a product is back. An erased account has no address left, a locked one
 * (banned, or in the grace of its own deletion) is not mailed, and neither is an address its owner
 * never confirmed: the inbox row is its only notice. A mail that fails is logged: the request is
 * already gone and the inbox row stands.
 *
 * @param titles - the product's names by locale
 */
const mailBuyer = (
    userId: string,
    productId: string,
    titles: Record<string, string>
): Promise<void> =>
    userService
        .getById(userId)
        .then((user) => {
            // A locked account (banned, or its owner asked to delete it) gets no optional notice.
            if (!user || !isAuthenticatable(user)) return;
            /**
             * An unproven address may belong to someone else, and the greeting carries a name the
             * requester typed: it gets the inbox row only.
             */
            if (!user.verifiedAt) return;
            const locale = user.locale ?? getDefaultLocale();
            const mail = backInStockEmail(locale, user.username, {
                title: titleFor(titles, locale),
                productUrl: frontendLink(productPagePath(productId), locale)
            });
            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
            void enqueueEmail({ to: user.email, subject: mail.subject }, mail.template, mail.data);
        })
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Stock alerts: could not mail user ${userId} about product ${productId}`,
                error
            });
            // Stryker restore all
        });

/**
 * One mail and one inbox row per request waiting for a product that is no longer `out_of_stock`,
 * then the request is gone. One after another: each is its own transaction over its own row.
 *
 * @param productId - the product that can be ordered again
 */
const answerWaiting = async (productId: string): Promise<void> => {
    const waiting = await stockAlertRepository.findByProductId(productId);
    if (waiting.length === 0) return;

    const titles = await productService.titlesById(productId);
    for (const alert of waiting)
        await answerOne({ id: String(alert._id), userId: String(alert.userId), productId }, titles);
};

/** How many products one availability read answers: the contract's bound on `GET /products/availability`. */
const SWEEP_BATCH = 100;

/**
 * Answer every waiting request whose product is no longer `out_of_stock`. Nothing announces a
 * restock to this module, so this pass, run every five minutes, is what notices one. It asks
 * inventory directly, `SWEEP_BATCH` products at a time, with no caller: a sweep has no permissions
 * to judge, and a hidden or removed product reads `out_of_stock`. A run that finds nothing to
 * answer is harmless, and a request answered here is gone, so a second run sends nothing.
 *
 * @see docs/modules/stock-alerts.md#the-sweep
 * @returns how many products had their waiting requests answered
 */
const sweepBuyable = async (): Promise<number> => {
    const waitingProductIds = await stockAlertRepository.distinctProductIds();
    let answered = 0;
    for (let start = 0; start < waitingProductIds.length; start += SWEEP_BATCH) {
        const states = await inventoryService.availabilityOfProducts(
            waitingProductIds.slice(start, start + SWEEP_BATCH)
        );
        for (const [productId, availability] of states) {
            if (availability === 'out_of_stock') continue;
            await answerWaiting(productId);
            answered += 1;
        }
    }
    return answered;
};

/** The module's one service handle. */
export const stockAlertService = {
    list,
    ask,
    cancel,
    exportRows,
    removeByUserId,
    removeByProductId,
    answerWaiting,
    sweepBuyable
};
