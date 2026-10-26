/**
 * The cases the PHP twin's money arithmetic must answer identically: `shared/cases/money.cases.yaml`,
 * run against `src/domain-primitives/money.ts`. The ISO 4217 table stays in that file.
 */

import { z } from 'zod';
import {
    apportion,
    fitsCurrency,
    minorUnitExponent,
    toDecimalAmount,
    toMinorUnits,
    scaleMoneyByRate,
    type Money
} from '@domain-primitives/money';
import { caseBase, describeCases } from '@tests/cases';

/** A number, or the word for one YAML cannot always carry as a number. */
const numeric = z.union([z.number(), z.enum(['NaN', 'Infinity', '-Infinity'])]).transform(Number);

/** Minor units: integers, branded at the call. */
const minor = z.number().int();

/** One case; `kind` picks the function under test. */
const moneyCase = z.discriminatedUnion('kind', [
    caseBase.extend({ kind: z.literal('exponent'), currency: z.string(), exponent: z.number() }),
    caseBase.extend({
        kind: z.literal('minor-text'),
        value: z.string(),
        currency: z.string(),
        minor
    }),
    caseBase.extend({
        kind: z.literal('minor-number'),
        value: numeric,
        currency: z.string(),
        minor
    }),
    caseBase.extend({
        kind: z.literal('decimal'),
        minor,
        currency: z.string(),
        decimal: z.number()
    }),
    caseBase.extend({
        kind: z.literal('fits'),
        amount: numeric,
        currency: z.string(),
        fits: z.boolean()
    }),
    caseBase.extend({
        kind: z.literal('apportion'),
        total: minor,
        weights: z.array(minor),
        shares: z.array(minor)
    }),
    caseBase.extend({
        kind: z.literal('scale-by-rate'),
        amount: minor,
        rate: numeric,
        result: minor
    })
]);

/** Brands an integer from the cases file as `Money`; the file holds minor units by definition. */
const asMoney = (value: number): Money => value as Money;

describeCases('money', moneyCase, 70, (one) => {
    switch (one.kind) {
        case 'exponent': {
            expect(minorUnitExponent(one.currency)).toBe(one.exponent);
            break;
        }
        case 'minor-text':
        case 'minor-number': {
            // `toBe` is `Object.is`: a negative zero would fail against the file's plain 0.
            expect(toMinorUnits(one.value, one.currency)).toBe(one.minor);
            break;
        }
        case 'decimal': {
            expect(toDecimalAmount(asMoney(one.minor), one.currency)).toBe(one.decimal);
            break;
        }
        case 'fits': {
            expect(fitsCurrency(one.amount, one.currency)).toBe(one.fits);
            break;
        }
        case 'apportion': {
            expect(
                apportion(
                    asMoney(one.total),
                    one.weights.map((weight) => asMoney(weight))
                )
            ).toEqual(one.shares);
            break;
        }
        case 'scale-by-rate': {
            expect(scaleMoneyByRate(asMoney(one.amount), one.rate)).toBe(one.result);
            break;
        }
    }
});
