/**
 * @module
 * The return and withdrawal notices. The one that matters legally is the withdrawal
 * acknowledgement (Art. 11a): it must name the order, the exact date and time, and — because Art.
 * 14(1) lets the consumer bear the postage only if told beforehand — who pays it.
 */
import { returnNoticeEmail } from '../../emails';

const AT = new Date('2026-07-01T14:05:00Z');
const INPUT = { orderRef: '2026-000041', returnPostage: 'consumer', at: AT } as const;

describe('returnNoticeEmail — withdrawal-acknowledged', () => {
    const { data, template } = returnNoticeEmail('withdrawal-acknowledged', 'en', 'Ada', INPUT);
    const text = `${data.body as string} ${data.postage as string}`;

    it('renders through the one notice template', () => {
        expect(template).toBe('returns.notice');
    });

    it('names the order and the exact date and time, in UTC', () => {
        expect(text).toContain('2026-000041');
        expect(text).toContain('July 1, 2026');
        expect(text).toMatch(/2:05\s?PM/);
        expect(text).toContain('UTC');
    });

    it('says who pays the postage — consumer by default', () => {
        expect(text).toContain('at your own cost');
    });

    it('says the shop pays when it does', () => {
        const shop = returnNoticeEmail('withdrawal-acknowledged', 'en', 'Ada', {
            ...INPUT,
            returnPostage: 'shop'
        });

        expect(shop.data.postage).toContain('We cover the cost');
    });

    it('names no postage when no goods are expected back', () => {
        const { returnPostage: _unused, ...withoutPostage } = INPUT;
        const none = returnNoticeEmail('withdrawal-acknowledged', 'en', 'Ada', withoutPostage);

        expect(none.data.postage).toBeUndefined();
        expect(none.data.body).toContain('2026-000041');
    });

    it('speaks the customer’s language', () => {
        const italian = returnNoticeEmail('withdrawal-acknowledged', 'it', 'Ada', INPUT);

        expect(italian.data.body).toContain('recesso');
        expect(italian.data.locale).toBe('it');
    });
});

describe('returnNoticeEmail — the other notices', () => {
    it('gives the decline reason and no postage sentence', () => {
        const { data } = returnNoticeEmail('return-declined', 'en', 'Ada', {
            ...INPUT,
            declineReason: 'Worn beyond testing'
        });

        expect(data.postage).toBeUndefined();
        expect(data.body).toContain('Worn beyond testing');
    });

    it.each(['return-requested', 'return-approved'] as const)(
        '%s says who pays the postage',
        (kind) => {
            const { data } = returnNoticeEmail(kind, 'en', 'Ada', INPUT);

            expect(data.postage).toEqual(expect.any(String));
        }
    );

    it.each([
        'withdrawal-acknowledged',
        'return-requested',
        'return-approved',
        'return-declined'
    ] as const)('%s resolves every copy slot rather than echoing a key', (kind) => {
        const { subject, data } = returnNoticeEmail(kind, 'en', 'Ada', INPUT);

        const copy = [subject, data.greeting, data.footer, data.body, data.postage].filter(
            (value): value is string => typeof value === 'string'
        );
        expect(copy.length).toBeGreaterThanOrEqual(4);
        for (const value of copy) expect(value).not.toMatch(/^returns\./);
        expect(data.greeting).toContain('Ada');
    });
});

describe('returnNoticeEmail — closing and the return address', () => {
    it('says what was refunded, formatted for the recipient', () => {
        const { data } = returnNoticeEmail('return-closed', 'en', 'Ada', {
            ...INPUT,
            refund: { amount: 62.5, currency: 'EUR' }
        });

        expect(data.body).toContain('€62.50');
        expect(data.postage).toBeUndefined();
    });

    it('formats the amount the way the customer’s language does', () => {
        const { data } = returnNoticeEmail('return-closed', 'it', 'Ada', {
            ...INPUT,
            refund: { amount: 62.5, currency: 'EUR' }
        });

        expect(data.body).toContain('62,50');
    });

    it('tells the customer where to send the goods when there is an address', () => {
        const { data } = returnNoticeEmail('return-approved', 'en', 'Ada', {
            ...INPUT,
            returnAddress: {
                name: 'Returns',
                street: 'Via Roma 1',
                city: 'Milano',
                zip: '20100',
                country: 'IT'
            }
        });

        expect(data.address).toBe('Send the goods to: Returns, Via Roma 1, 20100 Milano, IT');
    });

    it('leaves the address out when there is none', () => {
        const { data } = returnNoticeEmail('return-approved', 'en', 'Ada', INPUT);

        expect(data.address).toBeUndefined();
    });
});
