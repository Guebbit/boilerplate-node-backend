/**
 * @module
 * The payments mix for the stats: how much money came in by which method and provider.
 */

import { toMinorUnits, type Money } from '@domain-primitives/money';
import { type ReportWindow } from '@infrastructure/persistence/report';
import type { PaymentMethod } from '@types';
import { paymentRepository } from '../repository';

/** Payments that took money, grouped. */
export interface MixRow {
    method: PaymentMethod;
    provider: string;
    currency: string;
    payments: number;
    amount: Money;
}

/**
 * Payments created in the window that took money (`succeeded`, refunded or not), by method and
 * provider. A payment that never settled took none.
 * @param window - the half-open window
 */
export const methodMix = (window: ReportWindow): Promise<MixRow[]> =>
    paymentRepository.sumMix(window).then((rows) =>
        rows.map((row) => ({
            method: row._id.method,
            provider: row._id.provider,
            currency: row._id.currency,
            payments: row.payments,
            amount: toMinorUnits(row.amount, row._id.currency)
        }))
    );
