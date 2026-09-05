/**
 * @module
 * `POST /account/export` — one JSON answer to "give me my data" (Art. 15, 20), assembled from
 * every collection that holds something of the caller's. Its own file, beside `profile.ts` and
 * `authentication.ts`: it is neither proving identity (that's `requireFreshAuth`'s job, mounted
 * on the route) nor changing the account.
 *
 * Every read goes through each owning module's OWN function, never a repository or model type
 * reached around it — even the TYPES here are inferred off those functions' return values
 * (`Awaited<ReturnType<typeof …>>`) rather than importing a sibling's `Document` type directly,
 * so this file cannot describe a shape its own reads didn't actually produce. Every read is
 * scoped to the caller's id: an export that read past the caller would be the exact leak Art. 15
 * exists to prevent.
 */

import { environmentFlag } from '@infrastructure/runtime/environment';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { t } from '@infrastructure/i18n';
import { userRepository, TokenType, type UserDocument, type Token } from '@modules/users';
import { orderRepository } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { findShipmentsForOrders } from '@modules/delivery';
import { cartService } from '@modules/cart';
import { wishlistService } from '@modules/wishlist';
import { auditLogService } from '@modules/audit-logs';
import { findOwnTickets } from '@modules/feedback';
import { addressesGet } from './addresses';
import { accountAuditActions } from '../audit';

/** A live refresh session, metadata only — never the token value; see the field's own comment. */
interface ExportSession {
    id: string;
    type: 'refresh';
    /** The refresh-token VALUE never appears here — it is as good as a password. */
    expiration?: string;
    lastUsedAt?: string;
}

/**
 * One of the caller's own feedback tickets, minus `adminNotes`: that field is staff's internal
 * assessment of the ticket, not the submitter's data, and Art.
 * 15(4) protects the rights of others (whoever wrote the note) the same way it protects the
 * submitter's own. A REAL plain object, not a type-level `Omit` on the Mongoose document: the
 * document's own `toJSON()` carries no such omission (`feedback/model.ts`'s transform strips
 * nothing), so returning the document itself would still serialize `adminNotes` regardless of
 * what a narrower TypeScript type here claimed.
 */
interface ExportFeedbackTicket {
    id: string;
    name?: string;
    email: string;
    subject: string;
    message: string;
    status: string;
    respondedAt?: string;
    createdAt?: string;
}

/** {@link ExportFeedbackTicket}, built from the real document — the one place `adminNotes` is dropped. */
const toExportFeedback = (
    ticket: Awaited<ReturnType<typeof findOwnTickets>>[number]
): ExportFeedbackTicket => ({
    id: String(ticket._id),
    ...(ticket.name === undefined ? {} : { name: ticket.name }),
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    ...(ticket.respondedAt ? { respondedAt: ticket.respondedAt.toISOString() } : {}),
    ...(ticket.createdAt ? { createdAt: ticket.createdAt.toISOString() } : {})
});

/**
 * One of the caller's own payments, minus `userId`: already scoped to the caller by the query
 * that found it, so naming their own id back to them adds nothing. A real
 * plain object for the same reason {@link toExportFeedback} is: `applyPaymentTransform` carries
 * no such omission, so returning the document itself would still serialize `userId`.
 */
interface ExportPayment {
    id: string;
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    cardLast4?: string;
    createdAt?: string;
    updatedAt?: string;
}

/** {@link ExportPayment}, built from the real document. */
const toExportPayment = (
    payment: Awaited<ReturnType<typeof paymentService.findOwnPayments>>[number]
): ExportPayment => ({
    id: String(payment._id),
    orderId: String(payment.orderId),
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    ...(payment.cardLast4 === undefined ? {} : { cardLast4: payment.cardLast4 }),
    ...(payment.createdAt ? { createdAt: payment.createdAt.toISOString() } : {}),
    ...(payment.updatedAt ? { updatedAt: payment.updatedAt.toISOString() } : {})
});

/** The whole answer to "give me my data" — `POST /account/export`'s `data`. */
export interface AccountExportPayload {
    exportedAt: string;
    profile: UserDocument;
    addresses: Awaited<ReturnType<typeof addressesGet>>['addresses'];
    orders: Awaited<ReturnType<typeof orderRepository.search>>['items'];
    payments: ExportPayment[];
    shipments: Awaited<ReturnType<typeof findShipmentsForOrders>>;
    cart: { productId: string; quantity: number }[];
    wishlist: Awaited<ReturnType<typeof wishlistService.wishlistGet>>['items'];
    sessions: ExportSession[];
    auditLog: Awaited<ReturnType<typeof auditLogService.search>>['items'];
    /** Present only when `NODE_EXPORT_INCLUDE_FEEDBACK=true` — see the module docblock. */
    feedback?: ExportFeedbackTicket[];
}

/** Read past `findAll`/`.search()`'s own defaults — an export answers "all of it". */
const EVERYTHING = 100_000;

/**
 * This caller's own live refresh sessions, metadata only — mirrors `tokens.ts`'s `sessionsList`
 * filter, but keeps `type` (that file's `Session` doesn't carry it, since its one filter already
 * fixes it; an export naming every field is worth the one extra key).
 */
const ownSessions = (tokens: Token[]): ExportSession[] =>
    tokens
        .filter((token) => token.type === (TokenType.REFRESH as string) && !token.supersededAt)
        .map((token) => ({
            id: String(token._id),
            type: 'refresh' as const,
            ...(token.expiration ? { expiration: token.expiration.toISOString() } : {}),
            ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt.toISOString() } : {})
        }));

/**
 * Assemble and return the caller's own data — the whole point of the endpoint.
 *
 * @param userId - the authenticated caller's own id; this never reads anyone else's data
 * @param context - for the audit event this call itself is
 */
export const exportOwnData = (
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<AccountExportPayload> | ResponseReject> =>
    Promise.all([
        // `findByIdWithCredentials` for `tokens` (`select: false` otherwise) — profile and
        // sessions are both drawn from the same document.
        userRepository.findByIdWithCredentials(userId),
        addressesGet(userId),
        orderRepository.search({ pageSize: EVERYTHING }, orderRepository.ownerScope(userId)),
        paymentService.findOwnPayments(userId),
        cartService.cartGet(userId),
        wishlistService.wishlistGet(userId),
        auditLogService.search({ actor: userId, pageSize: EVERYTHING })
    ]).then(([profile, addressBook, orderPage, payments, cart, wishlist, auditPage]) => {
        if (!profile) return generateReject(404, [t('users.not-found')]);

        // `id`, not `_id` — same trap `get-order-invoice.ts` already names: `.search()` goes
        // through `.normalize()`, which turns `_id` into `id` on the way out, so `._id` reads as
        // `undefined` here despite `OrderDocument`'s type claiming otherwise. Same cast that file
        // uses, for the same reason: the STORED shape omits `id` by house convention.
        const orderIds = orderPage.items.map((order) =>
            String((order as typeof order & { id?: string }).id ?? order._id)
        );

        return findShipmentsForOrders(orderIds).then((shipments) =>
            (environmentFlag('NODE_EXPORT_INCLUDE_FEEDBACK', false)
                ? findOwnTickets(profile.email)
                : Promise.resolve(undefined)
            ).then((feedback) => {
                const payload: AccountExportPayload = {
                    exportedAt: new Date().toISOString(),
                    profile,
                    addresses: addressBook.addresses,
                    orders: orderPage.items,
                    payments: payments.map((payment) => toExportPayment(payment)),
                    shipments,
                    // Stripped to the stored line, not the joined product: the product's own
                    // name/price is catalogue data, not the caller's, and the shared `CartItem`
                    // contract this maps onto is `additionalProperties: false`.
                    cart: cart.map(({ productId, quantity }) => ({ productId, quantity })),
                    wishlist: wishlist.items,
                    sessions: ownSessions(profile.tokens),
                    auditLog: auditPage.items,
                    ...(feedback
                        ? { feedback: feedback.map((ticket) => toExportFeedback(ticket)) }
                        : {})
                };

                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: accountAuditActions.AUTH_DATA_EXPORTED,
                        outcome: 'success'
                    })
                );

                return generateSuccess(payload);
            })
        );
    });
