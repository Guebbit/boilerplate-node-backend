/**
 * @module
 * What is still invoiced on an invoice that earlier credit notes already took part of — pure, so
 * the arithmetic is testable without a database. A correction cancels this and reissues it, so
 * the books never credit the same money twice.
 *
 * Per VAT rate, the invoice's gross minus every credit note's gross at that rate. What is left
 * becomes one line per rate, built the way a partial credit note's lines are (`./credit-shares.ts`):
 * the VAT is extracted from them afterwards by `services/credit-breakdown.ts`.
 *
 * @see docs/modules/invoicing.md#correcting-the-buyer
 */

import {
    addMoney,
    subtractMoney,
    toDecimalString,
    toMinorUnits,
    NO_MONEY,
    type Money
} from '@domain-primitives/money';
import type { CreditLine } from './credit-shares';

/** One VAT-rate row of a document's summary, as the remainder reads it. */
interface RateGross {
    rate: number;
    grossAmount: string;
}

/**
 * The lines of what an invoice still stands for, after credit notes.
 *
 * @param invoiceSummary - the invoice's `taxSummary`
 * @param creditSummaries - the `taxSummary` of every credit note already issued against it
 * @param currency - the invoice's currency
 * @param title - the description every line carries, already in the invoice's language
 * @returns one line per rate with something left, in the invoice's rate order; empty once nothing is
 */
export const remainderLines = (
    invoiceSummary: readonly RateGross[],
    creditSummaries: readonly (readonly RateGross[])[],
    currency: string,
    title: string
): CreditLine[] =>
    invoiceSummary.flatMap((row): CreditLine[] => {
        const credited: Money = addMoney(
            NO_MONEY,
            ...creditSummaries.flatMap((summary) =>
                summary
                    .filter((candidate) => candidate.rate === row.rate)
                    .map((candidate) => toMinorUnits(candidate.grossAmount, currency))
            )
        );
        const left = subtractMoney(toMinorUnits(row.grossAmount, currency), credited);
        return left > 0
            ? [
                  {
                      title,
                      quantity: 1,
                      unitPrice: toDecimalString(left, currency),
                      taxRate: row.rate
                  }
              ]
            : [];
    });
