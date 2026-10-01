/**
 * @module
 * The withdrawal information and model form in the placed-order emails (CRD Art. 6(1)(h), 8(7),
 * Annex I). What matters is which of the three cases a basket falls in, and that every placeholder
 * the official text leaves open is filled: period, shop identity, goods address, postage payer.
 */
import path from 'node:path';
import ejs from 'ejs';
import { withEnvironmentOverrides } from '@tests/environment';
import { REPO_ROOT, MODULES_ROOT } from '@tests/paths';
import {
    bankTransferInstructionsEmail,
    orderConfirmEmail,
    withdrawalNotice,
    type OrderLines
} from '../../emails';
import { orderFrontendLink } from '../../config';

const ORDER_ID = 'order-1';

/** A line of the given kind; `requiresShipping` and `noWithdrawal` are the two flags that decide. */
const line = (
    title: string,
    flags: { requiresShipping?: boolean; noWithdrawal?: boolean } = {}
): OrderLines['items'][number] => ({ quantity: 1, product: { title, price: 10, ...flags } });

const GOODS: OrderLines = { items: [line('Dog Bed')] };
const DIGITAL: OrderLines = { items: [line('E-book', { requiresShipping: false })] };

/** The finished text of a notice, for a substring check that does not care which row holds it. */
const textOf = (notice: ReturnType<typeof withdrawalNotice>): string =>
    [...notice.terms, ...notice.effects, ...notice.form].join('\n');

describe('withdrawalNotice: which case applies', () => {
    it('goods: the period runs from receipt, with the return instructions', () => {
        const notice = withdrawalNotice('en', GOODS, ORDER_ID);

        expect(textOf(notice)).toContain('physical possession of the goods');
        expect(textOf(notice)).toContain('send back the goods');
        expect(notice.form.length).toBeGreaterThan(0);
    });

    it('digital: the period runs from the contract, with no goods-return paragraphs', () => {
        const notice = withdrawalNotice('en', DIGITAL, ORDER_ID);

        expect(textOf(notice)).toContain('from the day of the conclusion of the contract');
        expect(textOf(notice)).not.toContain('send back the goods');
        expect(textOf(notice)).not.toContain('bear');
        expect(notice.form.length).toBeGreaterThan(0);
    });

    it('a mix of goods and digital follows the goods clock', () => {
        const notice = withdrawalNotice(
            'en',
            { items: [...DIGITAL.items, ...GOODS.items] },
            ORDER_ID
        );

        expect(textOf(notice)).toContain('physical possession of the goods');
    });

    it('all excluded: only the Art. 6(1)(k) sentence, no instructions and no form', () => {
        const notice = withdrawalNotice(
            'en',
            { items: [line('Custom mug', { noWithdrawal: true })] },
            ORDER_ID
        );

        expect(notice.terms).toHaveLength(1);
        expect(notice.terms[0]).toContain('no right of withdrawal');
        expect(notice.effects).toEqual([]);
        expect(notice.form).toEqual([]);
    });

    it('some excluded: the instructions stay, and the excluded lines are named', () => {
        const notice = withdrawalNotice(
            'en',
            {
                items: [
                    line('Dog Bed'),
                    line('Custom mug', { noWithdrawal: true }),
                    line('Sealed soap', { noWithdrawal: true })
                ]
            },
            ORDER_ID
        );

        expect(textOf(notice)).toContain('No right of withdrawal: Custom mug and Sealed soap.');
        expect(notice.form.length).toBeGreaterThan(0);
    });

    it('does not mention exclusions when there are none', () => {
        expect(textOf(withdrawalNotice('en', GOODS, ORDER_ID))).not.toContain(
            'No right of withdrawal'
        );
    });
});

describe('withdrawalNotice: every placeholder is filled', () => {
    it('prints the shop identity in the instruction and in the form’s "To" row', () => {
        const { terms, form } = withdrawalNotice('en', GOODS, ORDER_ID);

        for (const fragment of [
            'Guebbit Demo Shop Srl',
            'Via Roma 1',
            '20100 Milano',
            '+39 02 1234567',
            'shop@example.com'
        ]) {
            expect(terms.join('\n')).toContain(fragment);
            expect(form.join('\n')).toContain(fragment);
        }
    });

    it('uses the configured period, and keeps the statutory 14 days for refund and return', () => {
        return withEnvironmentOverrides({ NODE_WITHDRAWAL_PERIOD_DAYS: '21' }, () => {
            const notice = withdrawalNotice('en', GOODS, ORDER_ID);

            expect(notice.terms[0]).toContain('within 21 days');
            expect(notice.effects[0]).toContain('not later than 14 days');
            return Promise.resolve();
        });
    });

    it('names the shop address as the goods address when no return address is configured', () => {
        const goodsRow = withdrawalNotice('en', GOODS, ORDER_ID).effects.find((row) =>
            row.includes('send back')
        );

        expect(goodsRow).toContain('Guebbit Demo Shop Srl, Via Roma 1, 20100 Milano, IT');
    });

    it('names the configured return address when there is one', () =>
        withEnvironmentOverrides(
            {
                NODE_RETURN_ADDRESS_NAME: 'Returns dept',
                NODE_RETURN_ADDRESS_STREET: 'Via Torino 9',
                NODE_RETURN_ADDRESS_CITY: 'Torino',
                NODE_RETURN_ADDRESS_ZIP: '10100',
                NODE_RETURN_ADDRESS_COUNTRY: 'IT'
            },
            () => {
                const goodsRow = withdrawalNotice('en', GOODS, ORDER_ID).effects.find((row) =>
                    row.includes('send back')
                );

                expect(goodsRow).toContain('Returns dept, Via Torino 9, 10100 Torino, IT');
                return Promise.resolve();
            }
        ));

    it('says the consumer bears the return postage by default', () => {
        expect(textOf(withdrawalNotice('en', GOODS, ORDER_ID))).toContain(
            'You will have to bear the direct cost of returning the goods.'
        );
    });

    it('says the shop bears it when the deployment offers free returns', () =>
        withEnvironmentOverrides({ NODE_RETURN_POSTAGE_PAYER: 'shop' }, () => {
            const notice = textOf(withdrawalNotice('en', GOODS, ORDER_ID));

            expect(notice).toContain('We will bear the cost of returning the goods.');
            expect(notice).not.toContain('You will have to bear');
            return Promise.resolve();
        }));

    it('points at the order page for the online withdrawal', () => {
        expect(withdrawalNotice('en', GOODS, ORDER_ID).terms.join('\n')).toContain(
            orderFrontendLink({ locale: 'en', id: ORDER_ID })
        );
    });

    it('leaves no placeholder or untranslated key behind, in either language', () => {
        for (const locale of ['en', 'it']) {
            for (const order of [GOODS, DIGITAL]) {
                const notice = withdrawalNotice(locale, order, ORDER_ID);

                expect(textOf(notice)).not.toMatch(/\{\{|orders\.email-withdrawal/);
                expect(notice.heading).not.toMatch(/^orders\./);
            }
        }
    });

    it('speaks Italian when asked', () => {
        expect(withdrawalNotice('it', GOODS, ORDER_ID).heading).toBe('Diritto di recesso');
    });
});

describe('both placed-order emails carry the notice', () => {
    const notice = withdrawalNotice('en', GOODS, ORDER_ID);

    it('the confirmation', () => {
        const { data } = orderConfirmEmail('en', 'Ada', GOODS, ORDER_ID);

        expect(data.withdrawalHeading).toBe(notice.heading);
        expect(data.withdrawalTerms).toEqual(notice.terms);
        expect(data.withdrawalEffects).toEqual(notice.effects);
        expect(data.withdrawalForm).toEqual(notice.form);
    });

    it('the bank-transfer instructions, which replace it', () => {
        const { data } = bankTransferInstructionsEmail(
            'en',
            'Ada',
            GOODS,
            { beneficiary: 'Shop', iban: 'DE89 3704 0044 0532 0130 00', reference: 'RF18' },
            new Date('2026-10-05T00:00:00.000Z'),
            ORDER_ID
        );

        expect(data.withdrawalHeading).toBe(notice.heading);
        expect(data.withdrawalTerms).toEqual(notice.terms);
        expect(data.withdrawalForm).toEqual(notice.form);
    });
});

/** Renders a real template the way the mailer does: from its file, rooted at the repo. */
const render = (email: { template: string; data: Record<string, unknown> }): Promise<string> =>
    ejs.renderFile(
        path.join(MODULES_ROOT, 'orders', 'templates', `${email.template}.ejs`),
        { ...email.data },
        { root: REPO_ROOT }
    );

describe('the shared partial, rendered', () => {
    it('prints the notice and the form in the confirmation', async () => {
        const html = await render(orderConfirmEmail('en', 'Ada', GOODS, ORDER_ID));

        expect(html).toContain('Right of withdrawal');
        expect(html).toContain('Model withdrawal form');
        expect(html).toContain('(*) Delete as appropriate.');
    });

    it('prints only the exclusion sentence, with no form, when everything is excluded', async () => {
        const html = await render(
            orderConfirmEmail(
                'en',
                'Ada',
                { items: [line('Custom mug', { noWithdrawal: true })] },
                ORDER_ID
            )
        );

        expect(html).toContain('no right of withdrawal');
        expect(html).not.toContain('Model withdrawal form');
    });

    it('escapes a shop name once, not twice', () =>
        withEnvironmentOverrides({ NODE_SHOP_LEGAL_NAME: 'Smith & Sons' }, async () => {
            const html = await render(orderConfirmEmail('en', 'Ada', GOODS, ORDER_ID));

            expect(html).toContain('Smith &amp; Sons');
            expect(html).not.toContain('&amp;amp;');
        }));
});
