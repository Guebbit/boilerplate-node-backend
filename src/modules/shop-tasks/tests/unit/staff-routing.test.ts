/**
 * @module
 * Who the shop tells, and where its notices point: every work notice the shop writes has a route
 * naming permission sets that exist, the ten summary rows point at the screen that lists what they
 * count, and the digest mail has its words in every served language.
 */
import { PERMISSION_SETS } from '@kernel/permissions';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import { translator } from '@infrastructure/i18n';
import { staffNoticeEmail } from '@modules/notifications';
import { staffDigestEmail } from '../../emails';
import { SHOP_STAFF_ROUTES, SUMMARY_PAGES, summaryLinkOf } from '../../staff-routing';

/** The shared staff screen paths the links are compared against. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

const CODES = Object.keys(SHOP_STAFF_ROUTES) as (keyof typeof SHOP_STAFF_ROUTES)[];

describe('SHOP_STAFF_ROUTES', () => {
    it.each(CODES)('%s names permission sets that exist', (code) => {
        const declared = new Set(PERMISSION_SETS.map(({ name }) => name));

        for (const set of SHOP_STAFF_ROUTES[code].sets) expect(declared).toContain(set);
    });

    it('mails only where someone must act soon: a paused checkout', () => {
        expect(SHOP_STAFF_ROUTES['shop-tasks.staff.purchase-hold-placed'].email).toBe('now');
        expect(SHOP_STAFF_ROUTES['shop-tasks.staff.return-requested'].email).toBe('none');
    });

    it('lists the twelve codes the shop writes: two announced, ten counted', () => {
        expect(CODES).toHaveLength(12);
        expect(Object.keys(SUMMARY_PAGES)).toHaveLength(10);
    });
});

describe('summaryLinkOf', () => {
    it.each([
        ['shop-tasks.staff.transfers-due', PAGES.salesOrders],
        ['shop-tasks.staff.preorders-late', PAGES.salesPreorders],
        ['shop-tasks.staff.delivery-holds-open', PAGES.salesOrders],
        ['shop-tasks.staff.withdrawals-awaiting-goods', PAGES.returns],
        ['shop-tasks.staff.returns-undecided', PAGES.returns],
        ['shop-tasks.staff.low-stock', PAGES.inventory],
        ['shop-tasks.staff.unshipped', PAGES.salesOrders],
        ['shop-tasks.staff.awaiting-tracking', PAGES.salesOrders],
        ['shop-tasks.staff.undelivered', PAGES.salesOrders],
        ['shop-tasks.staff.stale-refunds', PAGES.salesPayments]
    ] as const)('points %s at its shared list screen', (code, path) => {
        expect(summaryLinkOf(code)).toEqual({ template: path, parameters: {} });
    });
});

describe('the mails', () => {
    it.each(['en', 'it'])('words a purchase hold in %s with ids and instants only', (locale) => {
        const mail = staffNoticeEmail(
            locale,
            {
                code: 'shop-tasks.staff.purchase-hold-placed',
                params: { userId: 'u1', until: '2026-10-30T09:00:00.000Z' }
            },
            { template: PAGES.user, parameters: { id: 'u1' } }
        );

        expect(mail.subject).not.toContain('shop-tasks.staff-mail');
        expect(mail.data.summary).not.toContain('shop-tasks.staff-mail');
        expect(mail.data.link).toMatch(new RegExp(`/${locale}/users/u1$`));
        expect(JSON.stringify(mail)).not.toMatch(/@/);
    });

    it.each(['en', 'it'])('words every digest line in %s and links it to its screen', (locale) => {
        const items = (Object.keys(SUMMARY_PAGES) as (keyof typeof SUMMARY_PAGES)[]).map(
            (code) => ({ code, count: 4 })
        );

        const mail = staffDigestEmail(locale, items);

        expect(mail.template).toBe('shop-tasks.staff-digest');
        expect(mail.subject).toBe(translator(locale)('shop-tasks.staff-mail.digest.subject'));
        const { lines } = mail.data as { lines: { text: string; link: string }[] };
        expect(lines).toHaveLength(10);
        for (const line of lines) {
            expect(line.text).not.toContain('shop-tasks.staff-mail');
            expect(line.text).toContain('4');
            expect(line.link).toContain(`/${locale}/`);
        }
    });
});
