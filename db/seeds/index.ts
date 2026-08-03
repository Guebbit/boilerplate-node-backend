/*
 * Demo data seeder.
 *
 * `db:seed` owns DATA; `migrate-mongo` owns SCHEMA (PROPOSAL §8, option C). The two used to
 * both insert these fixtures, with different passwords for `gino@pino.it` — that duplicate is
 * gone, and this file is now the single source of the demo dataset.
 *
 * It runs on every container boot (see the compose `app` command → `npm run db:bootstrap`), so
 * it must be:
 *
 *   - IDEMPOTENT — fixed `_id`s are upserted, not created, so a second run is a no-op
 *   - GATED — refuses to touch a production database
 *
 * Passwords are given in PLAIN TEXT: the model's pre-save hook hashes them. Anything hashed by
 * hand here would drift from that hook, and its plaintext would be lost (which is exactly what
 * happened to the old `gino@pino.it` fixture).
 *
 * Usage:
 *   npm run db:seed          # upsert the fixtures
 *   npm run db:seed:reset    # drop the database first
 */
import 'dotenv/config';
import { Types } from 'mongoose';
import { start, connection } from '@core/bootstrap/database';
import { userRepository } from '@repositories/users';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';
import type { IOrderDocument } from '@models/orders';
import { clearCache, stopCache } from '@core/adapters/cache';
import { logger } from '@core/adapters/logger';
import { runScript } from '../run-script';

const reset = process.argv.includes('--reset');

/* Credentials the paired frontend's e2e specs and the README both quote. */
export const SEED_ADMIN_EMAIL = 'root@root.it';
export const SEED_ADMIN_PASSWORD = 'rootroot';
export const SEED_USER_EMAIL = 'gino@pino.it';
export const SEED_USER_PASSWORD = 'password';

const objectId = (value: string) => new Types.ObjectId(value);

const users = [
    {
        _id: objectId('65dd2bdb923652b7800fe180'),
        username: 'root',
        email: SEED_ADMIN_EMAIL,
        password: SEED_ADMIN_PASSWORD,
        imageUrl: String.raw`\images\9726c4217f5998511f372afab4800ac8.jpg`,
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
        imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
        admin: false,
        cart: { items: [], updatedAt: new Date() },
        tokens: []
    }
];

const products = [
    {
        _id: objectId('65dc8a99604c307b702b5ccc'),
        title: 'Sallyno Panino',
        price: 100,
        imageUrl: String.raw`\images\ad2e01890eebf72d06481c4fac3522ac.jpg`,
        active: true,
        description: 'Piccolo Sallyno panino. Da mangiare di coccole'
    },
    {
        _id: objectId('65dc8ad8604c307b702b5cd4'),
        title: 'Sallyno Carino',
        price: 50,
        imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
        active: true,
        description: 'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
        deletedAt: new Date('2024-02-26T23:34:44.832Z')
    },
    {
        _id: objectId('65dc9be92f2794d1c16741e1'),
        title: 'Miciona inutile',
        price: 1,
        imageUrl: String.raw`\images\60de15db7aed7174ef2d53d21e1f57a5.jpg`,
        active: true,
        description: 'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire'
    },
    {
        _id: objectId('65dcdec2b18ad5e4bd597f0f'),
        title: 'Micino pufettino',
        price: 77,
        imageUrl: String.raw`\images\f12ba2e44fe347010397f1dcba399808.jpg`,
        active: true,
        description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.'
    },
    {
        _id: objectId('6622c88a5123b1e286f440f8'),
        title: 'Bundle micini',
        price: 40,
        imageUrl: String.raw`\images\043cf5b2517fc99ce9a2c2f84288416d.jpg`,
        active: false,
        description: 'Produttori di rumori molesti a tutte le ore. Inactive product.'
    }
];

const orders = [
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
                    imageUrl: String.raw`\images\ad2e01890eebf72d06481c4fac3522ac.jpg`,
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
                    imageUrl: String.raw`\images\60de15db7aed7174ef2d53d21e1f57a5.jpg`,
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
                    imageUrl: String.raw`\images\f12ba2e44fe347010397f1dcba399808.jpg`,
                    active: true,
                    description: 'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.'
                },
                quantity: 20
            }
        ]
    }
];

/*
 * Upsert one fixture by its fixed `_id`.
 *
 * Documents go through `save()` rather than `updateOne(..., { upsert: true })` so the model's
 * pre-save hooks still run — most importantly the bcrypt password hash, which a raw driver
 * write would skip (that is precisely how the old migration's password drifted).
 */
const upsert = async (
    repository: {
        findById: (id: string) => PromiseLike<unknown>;
        create: (data: never) => Promise<unknown>;
    },
    fixture: { _id: Types.ObjectId }
): Promise<'created' | 'skipped'> => {
    const existing = await repository.findById(fixture._id.toString());
    if (existing) return 'skipped';
    await repository.create(fixture as never);
    return 'created';
};

async function seed() {
    /* A boot-time seeder that can drop or overwrite a production database is a footgun. */
    if (process.env.NODE_ENV === 'production') {
        logger.warn('db:seed refused to run: NODE_ENV is production.');
        return;
    }

    await start();

    if (reset) {
        await connection.dropDatabase();
        logger.info('Database dropped.');
    }

    const results = await Promise.all([
        ...users.map((user) => upsert(userRepository, user)),
        ...products.map((product) => upsert(productRepository, product)),
        ...orders.map((order) =>
            upsert(orderRepository, order as Partial<IOrderDocument> & { _id: Types.ObjectId })
        )
    ]);

    const created = results.filter((result) => result === 'created').length;

    /*
     * This wrote straight to Mongo, so the API's own invalidation never ran and the cache is
     * still holding pre-seed answers (usually empty lists). Drop them — otherwise `GET /products`
     * keeps serving `[]` until the TTL expires. Only worth doing when something actually changed.
     *
     * Fails open, deliberately (§9): seeding must succeed against a stack whose Redis is not up.
     * `reachable` is therefore read but never thrown on — it only decides which line gets
     * logged, so the fail-open is visible in the output instead of silently looking like a
     * cache that happened to be empty.
     */
    if (created > 0) {
        const { deleted, reachable } = await clearCache();
        if (reachable) logger.info(`Cache cleared after seeding: ${deleted} keys removed.`);
        else
            logger.warn(
                'Cache NOT cleared after seeding: Redis is unreachable. Seeding succeeded, but ' +
                    'pre-seed responses will keep being served until their TTL expires.'
            );
    }

    logger.info(
        `Seeding complete: ${created} created, ${results.length - created} already present.`
    );
}

/*
 * Cleanup lives in the runner's `finally`, not at the end of `seed()`: a throw partway through
 * used to skip it, leaving the Mongo and Redis sockets open so the process hung instead of
 * exiting with an error. Both closers are no-ops when their connection was never opened, which
 * covers the production-gate early return above.
 */
void runScript(seed, () => Promise.all([connection.close(), stopCache()]));
