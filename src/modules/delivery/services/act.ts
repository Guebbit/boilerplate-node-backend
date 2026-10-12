/**
 * @module
 * One fulfilment act, as one transaction. A ship, deliver, fulfil, hold, release or remainder cancel
 * writes the fulfillment order or shipment, the order's summary, the order's status move (when one
 * is due) and the outbox events together or not at all — so no reader ever sees a shipment the
 * order does not know about, or an order that says `shipped` with nothing left the door.
 *
 * Refusals are decided BEFORE the first write, inside the transaction, from the snapshot the
 * writes will land in. They are thrown as {@link ActRefusal}, which aborts the transaction and is
 * turned back into the ordinary `ResponseReject` at the door.
 *
 * See: docs/modules/delivery.md#one-transaction-per-act
 */

import type { ClientSession } from 'mongoose';
import { nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import type { ErrorCode } from '@api/error-codes';

/** A refusal thrown from inside an act's transaction: the transaction aborts, the door answers it. */
export class ActRefusal extends Error {
    /** What the door answers with. */
    readonly reject: ResponseReject;

    /**
     * @param reject - the refusal to answer with
     */
    constructor(reject: ResponseReject) {
        super('delivery act refused');
        this.reject = reject;
    }
}

/**
 * Abort the act with a refusal.
 * @param status - the HTTP status
 * @param code - the stable error code a client can act on
 * @param messageKey - the translation key of the message
 * @throws {ActRefusal} always
 */
export const refuse = (status: 404 | 409 | 422, code: ErrorCode, messageKey: string): never => {
    throw new ActRefusal(generateReject(status, [{ code, message: t(messageKey) }]));
};

/**
 * Abort the act with a 404 — the plain refusal for a record that is not there.
 * @param messageKey - the translation key of the message
 * @throws {ActRefusal} always
 */
export const refuseMissing = (messageKey: string): never => {
    throw new ActRefusal(generateReject(404, [t(messageKey)]));
};

/** What {@link runAct} answers: what the act produced, or the refusal that aborted it. */
export type ActResult<T> = { refused: false; value: T } | { refused: true; reject: ResponseReject };

/**
 * Run one act in a transaction. Resolves with what `work` returned, or with the refusal it threw;
 * wakes the outbox relay once the transaction has committed, since the events it wrote are only
 * visible to the relay from then on.
 *
 * @param work - the act; every write passes `session`
 * @returns what `work` returned, or the {@link ActRefusal}'s reject
 */
export const runAct = <T>(work: (session: ClientSession) => Promise<T>): Promise<ActResult<T>> =>
    withTransaction(work)
        .then((value): ActResult<T> => {
            nudgeOutbox();
            return { refused: false, value };
        })
        .catch((error: unknown): ActResult<T> => {
            if (error instanceof ActRefusal) return { refused: true, reject: error.reject };
            throw error instanceof Error ? error : new Error(String(error));
        });
