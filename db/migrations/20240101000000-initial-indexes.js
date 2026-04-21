const { ObjectId } = require('mongodb');

module.exports = {
    async up(db) {
        // Drop database
        // await db.dropDatabase();
        await db.collection('users').deleteMany({});
        await db.collection('products').deleteMany({});
        await db.collection('orders').deleteMany({});

        // ---- USERS ----
        await db.collection('users').insertMany([
            {
                _id: new ObjectId('65dd2bdb923652b7800fe180'),
                username: 'root',
                email: 'root@root.it',
                password: 'rootroot',
                imageUrl: '\\images\\9726c4217f5998511f372afab4800ac8.jpg',
                admin: true,
                cart: {
                    items: [
                        {
                            product: new ObjectId('65dc8a99604c307b702b5ccc'),
                            quantity: 2,
                        },
                        {
                            product: new ObjectId('65dcdec2b18ad5e4bd597f0f'),
                            quantity: 3,
                        },
                    ],
                    updatedAt: new Date(),
                },
                tokens: [],
            },
            {
                _id: new ObjectId('65de646a44f861fd83c13f13'),
                username: 'ginopinoshow',
                email: 'gino@pino.it',
                password:
                    '$2b$12$HwOdA7il/qvuU.psvWDOyuSMJ7ji/qMeFS3ma7DB8W6A/tGfCYEX.',
                imageUrl: '\\images\\96346b77daf138a279677cb75c400ee9.jpg',
                admin: false,
                cart: { items: [], updatedAt: new Date() },
                tokens: [],
            },
        ]);

        // ---- PRODUCTS ----
        await db.collection('products').insertMany([
            {
                _id: new ObjectId('65dc8a99604c307b702b5ccc'),
                title: 'Sallyno Panino',
                price: 100,
                imageUrl: '\\images\\ad2e01890eebf72d06481c4fac3522ac.jpg',
                active: true,
                description: 'Piccolo Sallyno panino. Da mangiare di coccole',
            },
            {
                _id: new ObjectId('65dc8ad8604c307b702b5cd4'),
                title: 'Sallyno Carino',
                price: 50,
                imageUrl: '\\images\\96346b77daf138a279677cb75c400ee9.jpg',
                active: true,
                description:
                    'Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.',
                deletedAt: new Date('2024-02-26T23:34:44.832Z'),
            },
            {
                _id: new ObjectId('65dc9be92f2794d1c16741e1'),
                title: 'Miciona inutile',
                price: 1,
                imageUrl: '\\images\\60de15db7aed7174ef2d53d21e1f57a5.jpg',
                active: true,
                description:
                    'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire',
            },
            {
                _id: new ObjectId('65dcdec2b18ad5e4bd597f0f'),
                title: 'Micino pufettino',
                price: 77,
                imageUrl: '\\images\\f12ba2e44fe347010397f1dcba399808.jpg',
                active: true,
                description:
                    'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.',
            },
            {
                _id: new ObjectId('6622c88a5123b1e286f440f8'),
                title: 'Bundle micini',
                price: 40,
                imageUrl: '\\images\\043cf5b2517fc99ce9a2c2f84288416d.jpg',
                active: false,
                description:
                    'Produttori di rumori molesti a tutte le ore. Inactive product.',
            },
        ]);

        // ---- ORDERS ----
        await db.collection('orders').insertMany([
            {
                _id: new ObjectId('65de73a69ca05739be2b5e85'),
                userId: new ObjectId('65dd2bdb923652b7800fe180'),
                email: 'oldpsw@root.it',
                products: [
                    {
                        product: {
                            _id: new ObjectId('65dc8a99604c307b702b5ccc'),
                            title: 'Sallyno Panino',
                            price: 100,
                            imageUrl: '\\images\\ad2e01890eebf72d06481c4fac3522ac.jpg',
                            active: true,
                            description:
                                'Piccolo Sallyno panino. Da mangiare di coccole',
                        },
                        quantity: 1,
                    },
                    {
                        product: {
                            _id: new ObjectId('65dc9be92f2794d1c16741e1'),
                            title: 'Miciona inutile',
                            price: 1,
                            imageUrl: '\\images\\60de15db7aed7174ef2d53d21e1f57a5.jpg',
                            active: true,
                            description:
                                'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire',
                        },
                        quantity: 10,
                    },
                ],
            },
            {
                _id: new ObjectId('661c795a9e22bcbef63a5832'),
                userId: new ObjectId('65dd2bdb923652b7800fe180'),
                email: 'root@root.it',
                products: [
                    {
                        product: {
                            _id: new ObjectId('65dcdec2b18ad5e4bd597f0f'),
                            title: 'Micino pufettino',
                            price: 77,
                            imageUrl: '\\images\\f12ba2e44fe347010397f1dcba399808.jpg',
                            active: true,
                            description:
                                'Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.',
                        },
                        quantity: 20,
                    },
                ],
            },
        ]);
    },

    async down(db) {
        // simple rollback strategy
        // await db.dropDatabase();
        await db.collection('users').deleteMany({});
        await db.collection('products').deleteMany({});
        await db.collection('orders').deleteMany({});
    },
};