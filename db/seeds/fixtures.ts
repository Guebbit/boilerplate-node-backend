/*
 * The demo dataset itself — data only, no side effects.
 *
 * Split out of `index.ts` because that module seeds on import (`void runScript(...)` at the
 * bottom), so nothing could look at these values without also connecting to a database and
 * writing to it. Tests need to look at them: `tests/unit/db/seed-fixtures.test.ts` asserts every
 * `imageUrl` is a URL path that resolves to a file this repository actually ships.
 *
 * That test exists because these fixtures shipped Windows-style `\images\x.jpg` paths for a long
 * time. They were captured from a `path.join()` on the machine that first uploaded them, and a
 * browser reads a backslash as a literal filename character, so every seeded product and user
 * pointed at an image the server would 404. Nothing served `public/` at all back then, so the
 * whole class of breakage was invisible.
 */

import { Types } from 'mongoose';

/* Credentials the paired frontend's e2e specs and the README both quote. */
export const SEED_ADMIN_EMAIL = 'root@root.it';
export const SEED_ADMIN_PASSWORD = 'rootroot';
export const SEED_USER_EMAIL = 'gino@pino.it';
export const SEED_USER_PASSWORD = 'password';

const objectId = (value: string) => new Types.ObjectId(value);

export const users = [
    {
        _id: objectId('65dd2bdb923652b7800fe180'),
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        imageUrl: '/images/seed/9726c4217f5998511f372afab4800ac8.jpg',
        admin: true,
        cart: {
            items: [
                { product: objectId('65dc8a99604c307b702b5ccc'), quantity: 2 },
                { product: objectId('65dcdec2b18ad5e4bd597f0f'), quantity: 3 }
            ],
            updatedAt: new Date()
        },
        tokens: []
    },
    {
        _id: objectId('65de646a44f861fd83c13f13'),
        username: 'ginopinoshow',
        email: SEED_USER_EMAIL,
        password: SEED_USER_PASSWORD,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        admin: false,
        cart: { items: [], updatedAt: new Date() },
        tokens: []
    }
];

export const products = [
    {
        _id: objectId('65dc8a99604c307b702b5ccc'),
        title: 'Sallyno Panino',
        price: 100,
        imageUrl: '/images/seed/ad2e01890eebf72d06481c4fac3522ac.jpg',
        active: true,
        description: 'Piccolo Sallyno panino. Da mangiare di coccole'
    },
    {
        _id: objectId('65dc8ad8604c307b702b5cd4'),
        title: 'Sallyno Carino',
        price: 50,
        imageUrl: '/images/seed/96346b77daf138a279677cb75c400ee9.jpg',
        active: true,
        description: 'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
        deletedAt: new Date('2024-02-26T23:34:44.832Z')
    },
    {
        _id: objectId('65dc9be92f2794d1c16741e1'),
        title: 'Miciona inutile',
        price: 1,
        imageUrl: '/images/seed/60de15db7aed7174ef2d53d21e1f57a5.jpg',
        active: true,
        description: 'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire'
    },
    {
        _id: objectId('65dcdec2b18ad5e4bd597f0f'),
        title: 'Micino pufettino',
        price: 77,
        imageUrl: '/images/seed/f12ba2e44fe347010397f1dcba399808.jpg',
        active: true,
        description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.'
    },
    {
        _id: objectId('6622c88a5123b1e286f440f8'),
        title: 'Bundle micini',
        price: 40,
        imageUrl: '/images/seed/043cf5b2517fc99ce9a2c2f84288416d.jpg',
        active: false,
        description: 'Produttori di rumori molesti a tutte le ore. Inactive product.'
    }
];

export const orders = [
    {
        _id: objectId('65de73a69ca05739be2b5e85'),
        userId: objectId('65dd2bdb923652b7800fe180'),
        email: 'oldpsw@root.it',
        items: [
            {
                product: {
                    _id: objectId('65dc8a99604c307b702b5ccc'),
                    title: 'Sallyno Panino',
                    price: 100,
                    imageUrl: '/images/seed/ad2e01890eebf72d06481c4fac3522ac.jpg',
                    active: true,
                    description: 'Piccolo Sallyno panino. Da mangiare di coccole'
                },
                quantity: 1
            },
            {
                product: {
                    _id: objectId('65dc9be92f2794d1c16741e1'),
                    title: 'Miciona inutile',
                    price: 1,
                    imageUrl: '/images/seed/60de15db7aed7174ef2d53d21e1f57a5.jpg',
                    active: true,
                    description:
                        'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire'
                },
                quantity: 10
            }
        ]
    },
    {
        _id: objectId('661c795a9e22bcbef63a5832'),
        userId: objectId('65dd2bdb923652b7800fe180'),
        email: 'root@root.it',
        items: [
            {
                product: {
                    _id: objectId('65dcdec2b18ad5e4bd597f0f'),
                    title: 'Micino pufettino',
                    price: 77,
                    imageUrl: '/images/seed/f12ba2e44fe347010397f1dcba399808.jpg',
                    active: true,
                    description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.'
                },
                quantity: 20
            }
        ]
    }
];
