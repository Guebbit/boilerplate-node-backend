/**
 * @module
 * `orderTaxBreakdown` — the pure arithmetic behind an order's VAT figures. Frozen `price` and
 * `taxRate` go in, the per-line and order-level amounts come out; the one branch that matters most
 * is the ALL-OR-NOTHING pre-VAT case, so it gets its own describe block.
 */
import { orderTaxBreakdown, type TaxableLineItem } from '../../domain/tax';

/** A line as `orderTaxBreakdown` actually receives one: raw aggregate output, loosely typed. */
const line = (price: number, quantity: number, taxRate?: number): TaxableLineItem => ({
    quantity,
    product: { price, ...(taxRate === undefined ? {} : { taxRate }) }
});

describe('orderTaxBreakdown — the pre-VAT order', () => {
    it('is undefined when every line predates VAT', () => {
        expect(orderTaxBreakdown({ items: [line(10, 1), line(20, 2)] })).toBeUndefined();
    });

    it('is undefined when even ONE line predates VAT — no partial breakdown', () => {
        // The decision: a single missing rate makes the WHOLE order pre-VAT, rather than implying
        // a rate on the line that never actually carried one.
        expect(orderTaxBreakdown({ items: [line(10, 1, 0.22), line(20, 2)] })).toBeUndefined();
    });

    it('is zero on every axis for an order with no lines at all — not pre-VAT, just empty', () => {
        expect(orderTaxBreakdown({ items: [] })).toEqual({ lines: [], netTotal: 0, taxTotal: 0 });
    });
});

describe('orderTaxBreakdown — a fully-VAT order', () => {
    it('extracts VAT from the gross line total, not from the unit price alone', () => {
        // 19.90 × 1 at 22%: gross 1990 cents, tax = round(1990 × 0.22/1.22) = 359, net = 1631.
        // The exact figures a known float-imprecise multiply must still land on — see money.ts.
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });

        expect(breakdown?.lines).toEqual([{ taxAmount: 3.59, netAmount: 16.31 }]);
    });

    it('taxes the LINE total (price × quantity), not the unit price alone', () => {
        // 10 × 2 units at 20%: gross 2000 cents, tax = round(2000 × 0.2/1.2) = 333 → 3.33. Per-line
        // rounding is not exactly linear in quantity (that's the point of rounding once per line,
        // not per unit), so this is a hand-checked value rather than "double the single-unit tax".
        const breakdown = orderTaxBreakdown({ items: [line(10, 2, 0.2)] });

        expect(breakdown?.lines[0]).toEqual({ taxAmount: 3.33, netAmount: 16.67 });
    });

    it('charges nothing at a zero rate', () => {
        const breakdown = orderTaxBreakdown({ items: [line(50, 1, 0)] });

        expect(breakdown?.lines).toEqual([{ taxAmount: 0, netAmount: 50 }]);
    });

    it('sums net and tax across every line for the order-level totals', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.1)]
        });

        expect(breakdown?.netTotal).toBeCloseTo(
            (breakdown?.lines[0].netAmount ?? 0) + (breakdown?.lines[1].netAmount ?? 0),
            6
        );
        expect(breakdown?.taxTotal).toBeCloseTo(
            (breakdown?.lines[0].taxAmount ?? 0) + (breakdown?.lines[1].taxAmount ?? 0),
            6
        );
    });

    it("every line's net plus tax reconstructs the line's own gross total, to the cent", () => {
        // The invoice's own promise: the columns must add back up to what was charged.
        const items = [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)];
        const breakdown = orderTaxBreakdown({ items });

        for (const [index, item] of items.entries()) {
            const gross = Number(item.product?.price) * Number(item.quantity);
            const { netAmount, taxAmount } = breakdown!.lines[index];

            expect(Math.round((netAmount + taxAmount) * 100)).toBe(Math.round(gross * 100));
        }
    });

    it('never produces a negative amount for a non-negative rate and price', () => {
        const breakdown = orderTaxBreakdown({ items: [line(0.01, 1, 0.99)] });

        expect(breakdown?.lines[0].taxAmount).toBeGreaterThanOrEqual(0);
        expect(breakdown?.lines[0].netAmount).toBeGreaterThanOrEqual(0);
    });
});
