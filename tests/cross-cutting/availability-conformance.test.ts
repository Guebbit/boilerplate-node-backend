/**
 * The cases the PHP twin's availability rule must answer identically:
 * `shared/cases/availability.cases.yaml`, run against `availabilityOf`.
 */

import { z } from 'zod';
import { availabilityOf } from '@modules/products';
import { caseBase, describeCases } from '@tests/cases';

/** The instant every case is judged at. */
const NOW = new Date('2026-10-12T10:00:00.000Z');

/** Days promised when a backorder names no restock date. */
const PROMISE_DAYS = 30;

/** An ISO instant as a `Date`. */
const instant = z.string().transform((text) => new Date(text));

/** One case: a product's settings and its inventory counts, and what a shopper is told. */
const availabilityCase = caseBase.extend({
    terms: z.strictObject({
        active: z.boolean().optional(),
        purchasable: z.boolean().optional(),
        deleted: z.boolean().optional(),
        releaseDate: instant.optional(),
        allowBackorder: z.boolean().optional(),
        restockDate: instant.optional()
    }),
    counts: z.strictObject({
        available: z.number().int().min(0),
        backorderLimit: z.number().int().nullable().optional(),
        backordered: z.number().int().optional()
    }),
    expect: z.strictObject({
        availability: z.enum(['in_stock', 'out_of_stock', 'preorder', 'backorder']),
        availabilityDate: instant.optional(),
        quantityAvailable: z.number().int().min(0).optional()
    })
});

describeCases('availability', availabilityCase, ({ terms, counts, expect: expected }) => {
    const { deleted, ...settings } = terms;
    expect(
        availabilityOf(
            { ...settings, ...(deleted ? { deletedAt: NOW } : {}) },
            counts,
            NOW,
            PROMISE_DAYS
        )
    ).toEqual(expected);
});
