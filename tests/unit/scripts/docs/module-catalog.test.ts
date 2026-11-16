import {
    moduleSidebar,
    pageOwner,
    renderModuleList,
    type CatalogEntry
} from '../../../../scripts/docs/module-catalog';

/** A catalogue entry with the fields a test does not care about filled in. */
const entry = (over: Partial<CatalogEntry> & Pick<CatalogEntry, 'name'>): CatalogEntry => ({
    group: 'foundation',
    subdomain: 'generic',
    summary: `${over.name} summary.`,
    pages: [],
    ...over
});

/** A small module catalogue the cases render. */
const CATALOGUE: CatalogEntry[] = [
    entry({ name: 'orders', group: 'shop' }),
    entry({ name: 'feedback' }),
    entry({
        name: 'account',
        pages: [{ stem: 'account-sessions', title: 'Sessions' }]
    }),
    entry({ name: 'cart', group: 'shop' }),
    entry({ name: 'example', group: 'example' })
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

    it('lists the example module last, linked to the section that explains it rather than to a page', () => {
        expect(list.indexOf('### Example')).toBeGreaterThan(list.indexOf('### Demo shop'));
        expect(list).toContain(
            '- [`example`](../understand/modules.md#the-module-template) — example summary.'
        );
        expect(list).not.toContain('./example.md');
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
        expect(sidebar.map(({ text }) => text)).toEqual([
            'Overview',
            'Foundation',
            'Demo shop',
            'Example'
        ]);
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

describe('moduleSidebar for the example module', () => {
    it('points at the theory section, since the example has no page of its own', () => {
        const sidebar = moduleSidebar(CATALOGUE);

        expect(sidebar[3].items).toEqual([
            { text: 'example', link: '/understand/modules#the-module-template' }
        ]);
    });
});

describe('pageOwner', () => {
    const names = new Set(['shop', 'shop-tasks', 'api-keys', 'account']);

    it('gives a page to the longest module name it starts with', () => {
        expect(pageOwner('shop-tasks-notices', names)).toBe('shop-tasks');
        expect(pageOwner('shop-hours', names)).toBe('shop');
    });

    it('gives a module’s own page, and a page of no module, to nobody', () => {
        expect(pageOwner('shop-tasks', names)).toBeUndefined();
        expect(pageOwner('start', names)).toBeUndefined();
    });
});
