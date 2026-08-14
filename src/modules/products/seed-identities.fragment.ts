export interface SeedProduct {
    id: string;
    title: string;
    description: string;
    price: number;
    /* Units on the shelf. One record keeps `0` on purpose: the storefront needs an out-of-stock
     * badge to render and checkout needs a refusal to demonstrate, and a dataset where nothing
     * is ever scarce can exercise neither. */
    stock: number;
    /* Filter facets. Free-text by design — the catalogue has no category table — and non-empty
     * on every PUBLIC record, so `GET /products/categories` and the storefront's chips have
     * something to show out of the box. */
    categories: string[];
    tags: string[];
    active: boolean;
    imageUrl: string;
    /* ISO 8601, or absent. Present on exactly one product: the role-scoping branches in
     * `isVisibleToCaller` (frontend) and the repositories' soft-delete filters (backend) need one
     * soft-deleted and one inactive record to have anything to exercise. */
    deletedAt?: string;
}

export const seedProducts: SeedProduct[] = [
    {
        id: '65dc8a99604c307b702b5ccc',
        title: 'Sallyno Panino',
        description: 'Piccolo Sallyno panino. Da mangiare di coccole',
        price: 100,
        stock: 25,
        categories: ['food'],
        tags: ['sallyno', 'cute'],
        active: true,
        imageUrl: '/images/seed/ad2e01890eebf72d06481c4fac3522ac.jpg'
    },
    {
        id: '65dc8ad8604c307b702b5cd4',
        title: 'Sallyno Carino',
        description: 'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
        price: 50,
        stock: 10,
        categories: ['pets'],
        tags: ['sallyno', 'illegal'],
        active: true,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        deletedAt: '2024-02-26T23:34:44.832Z'
    },
    {
        id: '65dc9be92f2794d1c16741e1',
        title: 'Miciona inutile',
        description: 'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire',
        price: 1,
        stock: 0,
        categories: ['pets'],
        tags: ['micini', 'useless'],
        active: true,
        imageUrl: '/images/seed/60de15db7aed7174ef2d53d21e1f57a5.jpg'
    },
    {
        id: '65dcdec2b18ad5e4bd597f0f',
        title: 'Micino pufettino',
        description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.',
        price: 77,
        stock: 40,
        categories: ['pets'],
        tags: ['micini', 'cute', 'illegal'],
        active: true,
        imageUrl: '/images/seed/f12ba2e44fe347010397f1dcba399808.jpg'
    },
    {
        id: '6622c88a5123b1e286f440f8',
        title: 'Bundle micini',
        description: 'Produttori di rumori molesti a tutte le ore. Inactive product.',
        price: 40,
        stock: 15,
        categories: ['pets', 'bundles'],
        tags: ['micini', 'noisy'],
        active: false,
        imageUrl: '/images/seed/043cf5b2517fc99ce9a2c2f84288416d.jpg'
    }
];
