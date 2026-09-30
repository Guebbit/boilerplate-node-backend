/**
 * @module
 * `orderTaxBreakdown` — the pure arithmetic behind an order's VAT figures. Frozen `price` and
 * `taxRate` go in, the per-line and order-level amounts come out. Every case here prices in EUR
 * (2 decimals) unless it is specifically about a currency's own minor-unit exponent — that's its
 * own describe block at the end, JPY (0 decimals) and KWD (3 decimals) against the same basket.
 */
import { lineTaxFromRateTotals, orderTaxBreakdown, type TaxableLineItem } from '../../domain/tax';

/** A line as `orderTaxBreakdown` actually receives one: raw aggregate output, loosely typed. */
const line = (price: number, quantity: number, taxRate: number): TaxableLineItem => ({
    quantity,
    product: { price, taxRate }
});

/** A digital line — `requiresShipping: false`, so it carries none of the shipping apportionment. */
const digitalLine = (price: number, quantity: number, taxRate: number): TaxableLineItem => ({
    quantity,
    product: { price, taxRate, requiresShipping: false }
});

describe('orderTaxBreakdown — an order with no lines', () => {
    it('is zero on every axis for an order with no lines at all', () => {
        expect(orderTaxBreakdown({ items: [], currency: 'EUR' })).toEqual({
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
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], currency: 'EUR' });

        expect(breakdown.lines).toEqual([{ taxAmount: 3.59, netAmount: 16.31, grossAmount: 19.9 }]);
    });

    it('taxes the LINE total (price × quantity), not the unit price alone', () => {
        // 10 × 2 units at 20%: gross 2000 cents, tax = round(2000 × 0.2/1.2) = 333 → 3.33. Per-line
        // rounding is not exactly linear in quantity (that's the point of rounding once per line,
        // not per unit), so this is a hand-checked value rather than "double the single-unit tax".
        const breakdown = orderTaxBreakdown({ items: [line(10, 2, 0.2)], currency: 'EUR' });

        expect(breakdown.lines[0]).toEqual({ taxAmount: 3.33, netAmount: 16.67, grossAmount: 20 });
    });

    it('charges nothing at a zero rate', () => {
        const breakdown = orderTaxBreakdown({ items: [line(50, 1, 0)], currency: 'EUR' });

        expect(breakdown.lines).toEqual([{ taxAmount: 0, netAmount: 50, grossAmount: 50 }]);
    });

    it('sums net and tax across every line for the order-level totals', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.1)],
            currency: 'EUR'
        });

        expect(breakdown.netTotal).toBeCloseTo(
            breakdown.lines[0].netAmount + breakdown.lines[1].netAmount,
            6
        );
        expect(breakdown.taxTotal).toBeCloseTo(
            breakdown.lines[0].taxAmount + breakdown.lines[1].taxAmount,
            6
        );
    });

    it("every line's net plus tax reconstructs the line's own gross total, to the cent", () => {
        // The invoice's own promise: the columns must add back up to what was charged.
        const items = [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)];
        const breakdown = orderTaxBreakdown({ items, currency: 'EUR' });

        for (const [index, item] of items.entries()) {
            const gross = Number(item.product?.price) * Number(item.quantity);
            const { netAmount, taxAmount } = breakdown.lines[index];

            expect(Math.round((netAmount + taxAmount) * 100)).toBe(Math.round(gross * 100));
        }
    });

    it('never produces a negative amount for a non-negative rate and price', () => {
        const breakdown = orderTaxBreakdown({ items: [line(0.01, 1, 0.99)], currency: 'EUR' });

        expect(breakdown.lines[0].taxAmount).toBeGreaterThanOrEqual(0);
        expect(breakdown.lines[0].netAmount).toBeGreaterThanOrEqual(0);
    });
});

describe('orderTaxBreakdown — shipping, apportioned pro-rata by line value', () => {
    it("folds shipping's own tax into taxTotal, on top of the lines' own", () => {
        // One line, so shipping's whole value is apportioned onto it: 5.00 shipping taxed at the
        // line's own 22% is round(500 × 0.22/1.22) = 90 → 0.90, on top of the line's own 2.18.
        const withoutShipping = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            currency: 'EUR'
        });
        const withShipping = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            shippingCost: 5,
            currency: 'EUR'
        });

        expect(withShipping.taxTotal).toBeCloseTo(withoutShipping.taxTotal + 0.9, 6);
    });

    it("never changes a line's own taxAmount/netAmount — shipping's tax is a total-only addition", () => {
        const withShipping = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            shippingCost: 5,
            currency: 'EUR'
        });

        expect(withShipping.lines).toEqual([
            { taxAmount: 3.59, netAmount: 16.31, grossAmount: 19.9 }
        ]);
    });

    it("splits shipping's tax across lines by their own gross value, each at its own rate", () => {
        // Two equal-value lines at different rates: shipping's 10.00 splits 50/50, each half
        // (5.00) taxed at ITS line's own rate — not the same rate applied to the whole shipping fee.
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0)],
            shippingCost: 10,
            currency: 'EUR'
        });
        const withoutShipping = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0)],
            currency: 'EUR'
        });

        // The zero-rated line contributes nothing extra; the standard-rated line's half of
        // shipping (5.00) adds round(500 × 0.22/1.22) = 90 → 0.90.
        expect(breakdown.taxTotal).toBeCloseTo(withoutShipping.taxTotal + 0.9, 6);
    });

    it('adds nothing for a checkout that chose no delivery method', () => {
        const withUndefined = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            currency: 'EUR'
        });
        const withZero = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            shippingCost: 0,
            currency: 'EUR'
        });

        expect(withUndefined).toEqual(withZero);
    });

    /*
     * E16(1): shipping is ancillary to the goods it delivers — a digital line never carries any of
     * it, so a physical line on the same order absorbs the WHOLE shipping cost rather than only
     * its own pro-rata share.
     */
    it('spreads shipping over the physical lines only, never onto a digital one', () => {
        // Equal-value lines, one physical one digital: without the fix, shipping would split
        // 50/50; with it, the physical line alone carries all of it, taxed as if it were the
        // order's only line, while the digital line is taxed on its own goods alone.
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), digitalLine(10, 1, 0.22)],
            shippingCost: 10,
            currency: 'EUR'
        });
        const physicalAlone = orderTaxBreakdown({
            items: [line(10, 1, 0.22)],
            shippingCost: 10,
            currency: 'EUR'
        });
        const digitalAlone = orderTaxBreakdown({
            items: [digitalLine(10, 1, 0.22)],
            currency: 'EUR'
        });

        expect(breakdown.lines[0]).toEqual(physicalAlone.lines[0]);
        expect(breakdown.lines[1]).toEqual(digitalAlone.lines[0]);
        expect(breakdown.taxTotal).toBeCloseTo(physicalAlone.taxTotal + digitalAlone.taxTotal, 6);
    });

    it('apportions nothing at all onto a digital-only order — there is no line to carry it', () => {
        const breakdown = orderTaxBreakdown({
            items: [digitalLine(10, 1, 0.22)],
            shippingCost: 10,
            currency: 'EUR'
        });

        expect(breakdown.shippingNetAmount).toBe(0);
        expect(breakdown.shippingTaxAmount).toBe(0);
    });
});

describe('orderTaxBreakdown — shippingNetAmount/shippingTaxAmount', () => {
    it('is zero on both when the order chose no delivery method', () => {
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], currency: 'EUR' });

        expect(breakdown.shippingNetAmount).toBe(0);
        expect(breakdown.shippingTaxAmount).toBe(0);
    });

    it('leaves shippingByRate empty when there is no shipping cost to apportion', () => {
        const breakdown = orderTaxBreakdown({ items: [line(19.9, 1, 0.22)], currency: 'EUR' });

        expect(breakdown.shippingByRate).toEqual([]);
    });

    it("splits shipping's own net/tax per rate, one row per rate that actually got a share", () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0.1)],
            shippingCost: 10,
            currency: 'EUR'
        });

        expect(breakdown.shippingByRate.map((row) => row.rate)).toEqual([0.1, 0.22]);
        // Equal-value lines split shipping 50/50: 5.00 taxed at each line's own rate.
        const at22 = breakdown.shippingByRate.find((row) => row.rate === 0.22);
        expect(
            Math.round((at22?.netAmount ?? 0) * 100) + Math.round((at22?.taxAmount ?? 0) * 100)
        ).toBe(500);
    });

    it('sums to the order-level shippingNetAmount/shippingTaxAmount across rows', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3,
            currency: 'EUR'
        });
        const rows = breakdown.shippingByRate;

        expect(Math.round(rows.reduce((sum, row) => sum + row.netAmount, 0) * 100)).toBe(
            Math.round(breakdown.shippingNetAmount * 100)
        );
        expect(Math.round(rows.reduce((sum, row) => sum + row.taxAmount, 0) * 100)).toBe(
            Math.round(breakdown.shippingTaxAmount * 100)
        );
    });

    it("reconstructs shipping's own gross cost from its net plus tax, to the cent", () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(10, 1, 0.1)],
            shippingCost: 7.5,
            currency: 'EUR'
        });

        expect(Math.round((breakdown.shippingNetAmount + breakdown.shippingTaxAmount) * 100)).toBe(
            750
        );
    });
});

describe('orderTaxBreakdown — taxSummary, one row per distinct rate', () => {
    it('is empty for a shippingless single line at a zero rate — nothing to summarise beyond zero', () => {
        const breakdown = orderTaxBreakdown({ items: [line(50, 1, 0)], currency: 'EUR' });

        expect(breakdown.taxSummary).toEqual([
            { rate: 0, netAmount: 50, taxAmount: 0, grossAmount: 50 }
        ]);
    });

    it('merges two lines at the SAME rate into one row', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.22)],
            currency: 'EUR'
        });

        expect(breakdown.taxSummary).toHaveLength(1);
        expect(breakdown.taxSummary[0].rate).toBe(0.22);
    });

    it('keeps two different rates as two separate rows, sorted ascending', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0.22), line(20, 1, 0.1)],
            currency: 'EUR'
        });

        expect(breakdown.taxSummary.map((row) => row.rate)).toEqual([0.1, 0.22]);
    });

    it("folds shipping's apportioned share into the SAME row as the line it was taxed at", () => {
        const withoutShipping = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            currency: 'EUR'
        });
        const withShipping = orderTaxBreakdown({
            items: [line(19.9, 1, 0.22)],
            shippingCost: 5,
            currency: 'EUR'
        });

        // One row, since there's one rate — its net/tax include shipping's 4.10/0.90 split.
        expect(withShipping.taxSummary).toHaveLength(1);
        expect(withShipping.taxSummary[0].netAmount).toBeGreaterThan(
            withoutShipping.taxSummary[0].netAmount
        );
    });

    it('every row is internally consistent: grossAmount is exactly netAmount + taxAmount', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3,
            currency: 'EUR'
        });

        for (const row of breakdown.taxSummary)
            expect(Math.round(row.grossAmount * 100)).toBe(
                Math.round((row.netAmount + row.taxAmount) * 100)
            );
    });

    it('reconciles to the totals: summed net is netTotal + shippingNetAmount, summed tax is taxTotal', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)],
            shippingCost: 12.3,
            currency: 'EUR'
        });
        const rows = breakdown.taxSummary;
        const summedNet = rows.reduce((sum, row) => sum + row.netAmount, 0);
        const summedTax = rows.reduce((sum, row) => sum + row.taxAmount, 0);

        expect(Math.round(summedNet * 100)).toBe(
            Math.round((breakdown.netTotal + breakdown.shippingNetAmount) * 100)
        );
        expect(Math.round(summedTax * 100)).toBe(Math.round(breakdown.taxTotal * 100));
    });

    it("reconciles to the order's own total: summed gross equals every line's price plus shipping", () => {
        const items = [line(19.9, 3, 0.22), line(5.5, 1, 0.1), line(100, 2, 0)];
        const shippingCost = 12.3;
        const breakdown = orderTaxBreakdown({ items, shippingCost, currency: 'EUR' });

        const totalPrice =
            items.reduce(
                (sum, item) => sum + Number(item.product?.price) * Number(item.quantity),
                0
            ) + shippingCost;
        const summedGross = breakdown.taxSummary.reduce((sum, row) => sum + row.grossAmount, 0);

        expect(Math.round(summedGross * 100)).toBe(Math.round(totalPrice * 100));
    });
});

describe("orderTaxBreakdown — each currency's own minor-unit exponent", () => {
    // The SAME basket (one line at 19.90, taxed at 22%, plus 5.00 shipping), priced in three
    // currencies with three different exponents — 2 decimals (EUR), 0 (JPY), 3 (KWD, minor unit
    // is the fils). Every figure must exact-round to ITS OWN minor unit, never to the cent.
    const basket = { items: [line(19.9, 1, 0.22)], shippingCost: 5 };

    it('rounds to the cent for a 2-decimal currency (EUR)', () => {
        const breakdown = orderTaxBreakdown({ ...basket, currency: 'EUR' });

        // 1990 gross cents; tax = round(1990 × 0.22/1.22) = 359 → €3.59.
        expect(breakdown.lines[0]).toEqual({
            taxAmount: 3.59,
            netAmount: 16.31,
            grossAmount: 19.9
        });
    });

    it('rounds to the whole unit for a 0-decimal currency (JPY) — no fractional yen', () => {
        const breakdown = orderTaxBreakdown({ ...basket, currency: 'JPY' });

        // Same 19.9 gross, but a JPY minor unit IS the yen: toMinorUnits(19.9, 'JPY') rounds to
        // 20 (whole yen), not 1990 hundredths of one. Tax = round(20 × 0.22/1.22) = 4 yen.
        expect(breakdown.lines[0]).toEqual({ taxAmount: 4, netAmount: 16, grossAmount: 20 });
        // Every figure is already a whole number — no third decimal a JPY price could never have.
        expect(Number.isInteger(breakdown.lines[0].grossAmount)).toBe(true);
    });

    it('rounds to the fils (3 decimals) for a 3-decimal currency (KWD)', () => {
        const breakdown = orderTaxBreakdown({ ...basket, currency: 'KWD' });

        // 19900 gross fils; tax = round(19900 × 0.22/1.22) = round(3588.5245...) = 3589 fils →
        // 3.589 KWD, NOT the 3.590 a EUR-then-×10 shortcut would give — the fils rounds the exact
        // fractional value directly, while EUR's cents already discarded that third digit first.
        expect(breakdown.lines[0]).toEqual({
            taxAmount: 3.589,
            netAmount: 16.311,
            grossAmount: 19.9
        });
        // The gross reconstructs to the fils, not just the cent — this is what a 3-decimal
        // currency needs and a 2-decimal one cannot distinguish from the EUR case above.
        expect(Math.round(breakdown.lines[0].grossAmount * 1000)).toBe(19_900);
    });

    it('apportions shipping to the same minor unit the currency actually uses', () => {
        // 5.00 shipping, one line, taxed at 22% either way — but the JPY figure must be a whole
        // yen (round(5 × 0.22/1.22) = 1), not the 0.90 a EUR-shaped rounding would produce.
        const eur = orderTaxBreakdown({ ...basket, currency: 'EUR' });
        const jpy = orderTaxBreakdown({ ...basket, currency: 'JPY' });

        expect(eur.shippingTaxAmount).toBeCloseTo(0.9, 6);
        expect(jpy.shippingTaxAmount).toBe(1);
        expect(Number.isInteger(jpy.shippingTaxAmount)).toBe(true);
    });
});

describe('orderTaxBreakdown — VAT rounded once per rate (EN 16931 BR-CO-17), worked examples', () => {
    it('three 0.10 lines at 22%: 0.05 of VAT, not the 0.06 that per-line rounding gives', () => {
        // Per line: round(10 x 0.22/1.22) = round(1.803) = 2, so 3 lines would sum to 6 cents.
        // Per rate: gross 30 -> round(30 x 0.22/1.22) = round(5.409) = 5 cents, once.
        const breakdown = orderTaxBreakdown({
            items: [line(0.1, 1, 0.22), line(0.1, 1, 0.22), line(0.1, 1, 0.22)],
            currency: 'EUR'
        });

        expect(breakdown.taxTotal).toBe(0.05);
        expect(breakdown.netTotal).toBe(0.25);
        expect(breakdown.taxSummary).toEqual([
            { rate: 0.22, netAmount: 0.25, taxAmount: 0.05, grossAmount: 0.3 }
        ]);
    });

    it("spreads the rate's one figure over its lines, so the lines still add up to it exactly", () => {
        // 5 cents over three equal 10-cent lines: floor gives 1 each, the 2 left over go to the
        // first of the equal weights -> [3, 1, 1]. Nets follow: 10 - tax.
        const breakdown = orderTaxBreakdown({
            items: [line(0.1, 1, 0.22), line(0.1, 1, 0.22), line(0.1, 1, 0.22)],
            currency: 'EUR'
        });

        expect(breakdown.lines.map((row) => row.taxAmount)).toEqual([0.03, 0.01, 0.01]);
        expect(breakdown.lines.map((row) => row.netAmount)).toEqual([0.07, 0.09, 0.09]);
    });

    it('mixed rates with shipping: each rate rounds once, on its goods AND its shipping share', () => {
        // Goods: 19.90 x 2 at 22% (3980 cents), 5.50 x 3 at 10% (1650). Shipping 6.00 = 600.
        // Shipping by gross weight: floor(600 x 3980/5630) = 424, floor(600 x 1650/5630) = 175,
        // the 1 cent left over goes to the heavier line -> 425 and 175.
        // 22%: taxable 3980 + 425 = 4405 -> round(4405 x 0.22/1.22) = round(794.36) = 794.
        //   Split goods/shipping by weight: 718 / 76 (the odd cent to the heavier, goods).
        // 10%: taxable 1650 + 175 = 1825 -> round(1825 x 0.1/1.1) = round(165.91) = 166.
        //   Split: 151 / 15.
        const breakdown = orderTaxBreakdown({
            items: [line(19.9, 2, 0.22), line(5.5, 3, 0.1)],
            shippingCost: 6,
            currency: 'EUR'
        });

        expect(breakdown.taxSummary).toEqual([
            { rate: 0.1, netAmount: 16.59, taxAmount: 1.66, grossAmount: 18.25 },
            { rate: 0.22, netAmount: 36.11, taxAmount: 7.94, grossAmount: 44.05 }
        ]);
        expect(breakdown.shippingByRate).toEqual([
            { rate: 0.1, netAmount: 1.6, taxAmount: 0.15, grossAmount: 1.75 },
            { rate: 0.22, netAmount: 3.49, taxAmount: 0.76, grossAmount: 4.25 }
        ]);
        expect(breakdown.lines).toEqual([
            { taxAmount: 7.18, netAmount: 32.62, grossAmount: 39.8 },
            { taxAmount: 1.51, netAmount: 14.99, grossAmount: 16.5 }
        ]);
        expect(breakdown.netTotal).toBe(47.61);
        expect(breakdown.shippingNetAmount).toBe(5.09);
        expect(breakdown.shippingTaxAmount).toBe(0.91);
        expect(breakdown.taxTotal).toBe(9.6);
        // Reconciles to what was charged: 39.80 + 16.50 + 6.00.
        expect(breakdown.netTotal + breakdown.shippingNetAmount + breakdown.taxTotal).toBeCloseTo(
            62.3,
            6
        );
    });

    it('a zero-rated line carries no VAT and shares no rate with a taxed one', () => {
        const breakdown = orderTaxBreakdown({
            items: [line(10, 1, 0), line(10, 1, 0.22)],
            currency: 'EUR'
        });

        expect(breakdown.taxSummary).toEqual([
            { rate: 0, netAmount: 10, taxAmount: 0, grossAmount: 10 },
            { rate: 0.22, netAmount: 8.2, taxAmount: 1.8, grossAmount: 10 }
        ]);
    });

    it('JPY, no minor unit: three 105-yen lines at 8% owe 23 yen, not the 24 per-line rounding gives', () => {
        // Per line round(105 x 0.08/1.08) = round(7.78) = 8, x3 = 24. Per rate: gross 315 ->
        // round(23.33) = 23.
        const breakdown = orderTaxBreakdown({
            items: [line(105, 1, 0.08), line(105, 1, 0.08), line(105, 1, 0.08)],
            currency: 'JPY'
        });

        expect(breakdown.taxTotal).toBe(23);
        expect(breakdown.netTotal).toBe(292);
    });

    it('KWD, thousandths: three 0.101 lines at 22% owe 0.055, not the 0.054 per-line rounding gives', () => {
        // Per line round(101 x 0.22/1.22) = round(18.21) = 18, x3 = 54 fils. Per rate: gross 303
        // -> round(54.64) = 55 fils.
        const breakdown = orderTaxBreakdown({
            items: [line(0.101, 1, 0.22), line(0.101, 1, 0.22), line(0.101, 1, 0.22)],
            currency: 'KWD'
        });

        expect(breakdown.taxTotal).toBe(0.055);
        expect(breakdown.netTotal).toBe(0.248);
    });
});

describe('lineTaxFromRateTotals — an issued document re-derives its lines from frozen rate totals', () => {
    it("spreads each rate's frozen goods VAT over that rate's lines, leaving unlisted rates at zero", () => {
        // 22% goods VAT frozen as 0.05 over three 0.10 lines; the 0% line is not in the map.
        const lines = lineTaxFromRateTotals(
            [line(0.1, 1, 0.22), line(0.1, 1, 0.22), line(0.1, 1, 0.22), line(1, 1, 0)],
            'EUR',
            new Map([[0.22, 0.05]])
        );

        expect(lines.map((row) => row.taxAmount)).toEqual([0.03, 0.01, 0.01, 0]);
        expect(lines.map((row) => row.netAmount)).toEqual([0.07, 0.09, 0.09, 1]);
    });
});
