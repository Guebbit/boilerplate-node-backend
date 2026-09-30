import {
    moduleSidebar,
    renderModuleList,
    type CatalogueEntry
} from '../../../../scripts/docs/module-catalogue';

/** A catalogue entry with the fields a test does not care about filled in. */
const entry = (over: Partial<CatalogueEntry> & Pick<CatalogueEntry, 'name'>): CatalogueEntry => ({
    group: 'foundation',
    subdomain: 'generic',
    summary: `${over.name} summary.`,
    pages: [],
    ...over
});

const CATALOGUE: CatalogueEntry[] = [
    entry({ name: 'orders', group: 'shop' }),
    entry({ name: 'feedback' }),
    entry({
        name: 'account',
        pages: [{ stem: 'account-sessions', title: 'Sessions' }]
    }),
    entry({ name: 'cart', group: 'shop' })
];

describe('renderModuleList', () => {
    const list = renderModuleList(CATALOGUE);

    it('puts the foundation before the demo shop, each module under its own group', () => {
        expect(list.indexOf('### Foundation')).toBeLessThan(list.indexOf('### Demo shop'));
        expect(list.indexOf('[`feedback`]')).toBeLessThan(list.indexOf('### Demo shop'));
        expect(list.indexOf('[`orders`]')).toBeGreaterThan(list.indexOf('### Demo shop'));
    });

    it('lists a group alphabetically, with the summary and the deeper pages', () => {
        expect(list.indexOf('[`account`]')).toBeLessThan(list.indexOf('[`feedback`]'));
        expect(list).toContain(
            '- [`account`](./account.md) — account summary. Deeper: [Sessions](./account-sessions.md).'
        );
    });

    it('omits a group with no modules, so a stripped shop leaves no empty heading', () => {
        expect(
            renderModuleList(CATALOGUE.filter(({ group }) => group === 'foundation'))
        ).not.toContain('Demo shop');
    });
});

describe('moduleSidebar', () => {
    const sidebar = moduleSidebar(CATALOGUE);

    it('opens with the overview, then one section per group', () => {
        expect(sidebar.map(({ text }) => text)).toEqual(['Overview', 'Foundation', 'Demo shop']);
    });

    it('nests a module’s deeper pages under it', () => {
        const account = sidebar[1].items.find(({ text }) => text === 'account');

        expect(account).toEqual({
            text: 'account',
            link: '/modules/account',
            items: [{ text: 'Sessions', link: '/modules/account-sessions' }]
        });
    });

    it('gives a module with no deeper pages no empty `items`', () => {
        expect(sidebar[2].items.find(({ text }) => text === 'cart')).toEqual({
            text: 'cart',
            link: '/modules/cart'
        });
    });
});
