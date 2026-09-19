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
        expect(orderTaxBreakdown({ items: [] })).toEqual({
            lines: [],
            netTotal: 0,
            taxTotal: 0,
            shippingNetAmount: 0,
            shippingTaxAmount: 0,
            taxSummary: [],
            shippingByRate: []
        });
    });
});

describe('orderTaxBreakdown — a fully-VAT order', () => {
    it('extracts VAT from the gross line total, not from the unit price alone', () => {
        // 19.90 × 1 at 22%: gross 1990 cents, tax = round(1990 × 0.22/1.22) = 359, net = 1631.
        // The exact figures a known float-imprecise multiply must still land on — see money.ts.
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });

        expect(breakdown?.lines).toEqual([
            { taxAmount: 3.59, netAmount: 16.31, grossAmount: 19.9 }
        ]);
    });

    it('taxes the LINE total (price × quantity), not the unit price alone', () => {
        // 10 × 2 units at 20%: gross 2000 cents, tax = round(2000 × 0.2/1.2) = 333 → 3.33. Per-line
        // rounding is not exactly linear in quantity (that's the point of rounding once per line,
        // not per unit), so this is a hand-checked value rather than "double the single-unit tax".
        const breakdown = orderTaxBreakdown({ items: [line(10, 2, 0.2)] });

        expect(breakdown?.lines[0]).toEqual({ taxAmount: 3.33, netAmount: 16.67, grossAmount: 20 });
    });

    it('charges nothing at a zero rate', () => {
        const breakdown = orderTaxBreakdown({ items: [line(50, 1, 0)] });

        expect(breakdown?.lines).toEqual([{ taxAmount: 0, netAmount: 50, grossAmount: 50 }]);
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

describe('orderTaxBreakdown — shipping, apportioned pro-rata by line value', () => {
    it("folds shipping's own tax into taxTotal, on top of the lines' own", () => {
        // One line, so shipping's whole value is apportioned onto it: 5.00 shipping taxed at the
        // line's own 22% is round(500 × 0.22/1.22) = 90 → 0.90, on top of the line's own 2.18.
        const withoutShipping = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });
        const withShipping = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], shippingCost: 5 });

        expect(withShipping?.taxTotal).toBeCloseTo((withoutShipping?.taxTotal ?? 0) + 0.9, 6);
    });

    it("never changes a line's own taxAmount/netAmount — shipping's tax is a total-only addition", () => {
        const withShipping = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], shippingCost: 5 });

        expect(withShipping?.lines).toEqual([
            { taxAmount: 3.59, netAmount: 16.31, grossAmount: 19.9 }
        ]);
    });

    it("splits shipping's tax across lines by their own gross value, each at its own rate", () => {
        // Two equal-value lines at different rates: shipping's 10.00 splits 50/50, each half
        // (5.00) taxed at ITS line's own rate — not the same rate applied to the whole shipping fee.
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0)],
            shippingCost: 10
        });
        const withoutShipping = orderTaxBreakdown({ items: [line(10, 1, 0.22), line(10, 1, 0)] });

        // The zero-rated line contributes nothing extra; the standard-rated line's half of
        // shipping (5.00) adds round(500 × 0.22/1.22) = 90 → 0.90.
        expect(breakdown?.taxTotal).toBeCloseTo((withoutShipping?.taxTotal ?? 0) + 0.9, 6);
    });

    it('adds nothing for a checkout that chose no delivery method', () => {
        const withUndefined = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });
        const withZero = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], shippingCost: 0 });

        expect(withUndefined).toEqual(withZero);
    });

    it('is still undefined for a pre-VAT order, regardless of shipping', () => {
        expect(orderTaxBreakdown({ items: [line(19.9, 1)], shippingCost: 5 })).toBeUndefined();
    });
});

describe('orderTaxBreakdown — shippingNetAmount/shippingTaxAmount', () => {
    it('is zero on both when the order chose no delivery method', () => {
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });

        expect(breakdown?.shippingNetAmount).toBe(0);
        expect(breakdown?.shippingTaxAmount).toBe(0);
    });

    it('leaves shippingByRate empty when there is no shipping cost to apportion', () => {
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });

        expect(breakdown?.shippingByRate).toEqual([]);
    });

    it("splits shipping's own net/tax per rate, one row per rate that actually got a share", () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0.1)],
            shippingCost: 10
        });

        expect(breakdown?.shippingByRate.map((row) => row.rate)).toEqual([0.1, 0.22]);
        // Equal-value lines split shipping 50/50: 5.00 taxed at each line's own rate.
        const at22 = breakdown?.shippingByRate.find((row) => row.rate === 0.22);
        expect(
            Math.round((at22?.netAmount ?? 0) * 100) + Math.round((at22?.taxAmount ?? 0) * 100)
        ).toBe(500);
    });

    it('sums to the order-level shippingNetAmount/shippingTaxAmount across rows', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3
        });
        const rows = breakdown?.shippingByRate ?? [];

        expect(Math.round(rows.reduce((sum, row) => sum + row.netAmount, 0) * 100)).toBe(
            Math.round((breakdown?.shippingNetAmount ?? 0) * 100)
        );
        expect(Math.round(rows.reduce((sum, row) => sum + row.taxAmount, 0) * 100)).toBe(
            Math.round((breakdown?.shippingTaxAmount ?? 0) * 100)
        );
    });

    it("reconstructs shipping's own gross cost from its net plus tax, to the cent", () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0.1)],
            shippingCost: 7.5
        });

        expect(
            Math.round(
                ((breakdown?.shippingNetAmount ?? 0) + (breakdown?.shippingTaxAmount ?? 0)) * 100
            )
        ).toBe(750);
    });
});

describe('orderTaxBreakdown — taxSummary, one row per distinct rate', () => {
    it('is empty for a shippingless single line at a zero rate — nothing to summarise beyond zero', () => {
        const breakdown = orderTaxBreakdown({ items: [line(50, 1, 0)] });

        expect(breakdown?.taxSummary).toEqual([
            { rate: 0, netAmount: 50, taxAmount: 0, grossAmount: 50 }
        ]);
    });

    it('merges two lines at the SAME rate into one row', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.22)]
        });

        expect(breakdown?.taxSummary).toHaveLength(1);
        expect(breakdown?.taxSummary[0].rate).toBe(0.22);
    });

    it('keeps two different rates as two separate rows, sorted ascending', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.1)]
        });

        expect(breakdown?.taxSummary.map((row) => row.rate)).toEqual([0.1, 0.22]);
    });

    it("folds shipping's apportioned share into the SAME row as the line it was taxed at", () => {
        const withoutShipping = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)] });
        const withShipping = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], shippingCost: 5 });

        // One row, since there's one rate — its net/tax include shipping's 4.10/0.90 split.
        expect(withShipping?.taxSummary).toHaveLength(1);
        expect(withShipping?.taxSummary[0].netAmount).toBeGreaterThan(
            withoutShipping?.taxSummary[0].netAmount ?? 0
        );
    });

    it('every row is internally consistent: grossAmount is exactly netAmount + taxAmount', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3
        });

        for (const row of breakdown?.taxSummary ?? [])
            expect(Math.round(row.grossAmount * 100)).toBe(
                Math.round((row.netAmount + row.taxAmount) * 100)
            );
    });

    it('reconciles to the totals: summed net is netTotal + shippingNetAmount, summed tax is taxTotal', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3
        });
        const rows = breakdown?.taxSummary ?? [];
        const summedNet = rows.reduce((sum, row) => sum + row.netAmount, 0);
        const summedTax = rows.reduce((sum, row) => sum + row.taxAmount, 0);

        expect(Math.round(summedNet * 100)).toBe(
            Math.round(((breakdown?.netTotal ?? 0) + (breakdown?.shippingNetAmount ?? 0)) * 100)
        );
        expect(Math.round(summedTax * 100)).toBe(Math.round((breakdown?.taxTotal ?? 0) * 100));
    });

    it("reconciles to the order's own total: summed gross equals every line's price plus shipping", () => {
        const items = [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)];
        const shippingCost = 12.3;
        const breakdown = orderTaxBreakdown({ items, shippingCost });

        const totalPrice =
            items.reduce(
                (sum, item) => sum + Number(item.product?.price) * Number(item.quantity),
                0
            ) + shippingCost;
        const summedGross = (breakdown?.taxSummary ?? []).reduce(
            (sum, row) => sum + row.grossAmount,
            0
        );

        expect(Math.round(summedGross * 100)).toBe(Math.round(totalPrice * 100));
    });
});
