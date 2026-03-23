import type { Request, Response } from "express";
import { sequelize } from "@utils/database";
import UserRepository from "@repositories/users";
import ProductRepository from "@repositories/products";
import OrderRepository from "@repositories/orders";


/**
 * Drop and recreate all tables, then seed with example data.
 * Could add "unzipper" to unzip images backup folder automatically but don't want to add unnecessary dependencies
 *
 * @param request
 * @param response
 */
export const getResetDatabase = async (_request: Request, response: Response) => {
    // Drop all tables and recreate them
    await sequelize.sync({ force: true });

    // Users
    const root = await UserRepository.create({
        email: "root@root.it",
        password: "rootroot",
        username: "root",
        imageUrl: String.raw`\images\9726c4217f5998511f372afab4800ac8.jpg`,
        admin: true,
    });
    await UserRepository.create({
        email: "gino@pino.it",
        password: "$2b$12$HwOdA7il/qvuU.psvWDOyuSMJ7ji/qMeFS3ma7DB8W6A/tGfCYEX.",
        username: "gino",
        imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
        admin: false,
    });

    // Products
    const prod1 = await ProductRepository.create({
        title: "Sallyno Panino",
        price: 100,
        imageUrl: String.raw`\images\ad2e01890eebf72d06481c4fac3522ac.jpg`,
        active: true,
        description: "Piccolo Sallyno panino. Da mangiare di coccole",
    });
    await ProductRepository.create({
        title: "Sallyno Carino",
        price: 50,
        imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
        active: true,
        description: "Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.",
        deletedAt: new Date('2024-02-26T23:34:44.832Z'),
    });
    await ProductRepository.create({
        title: "Miciona inutile",
        price: 1,
        imageUrl: String.raw`\images\60de15db7aed7174ef2d53d21e1f57a5.jpg`,
        active: true,
        description: "Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire",
    });
    const prod4 = await ProductRepository.create({
        title: "Micino pufettino",
        price: 77,
        imageUrl: String.raw`\images\f12ba2e44fe347010397f1dcba399808.jpg`,
        active: true,
        description: "Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.",
    });
    await ProductRepository.create({
        title: "Bundle micini",
        price: 40,
        imageUrl: String.raw`\images\043cf5b2517fc99ce9a2c2f84288416d.jpg`,
        active: false,
        description: "Produttori di rumori molesti a tutte le ore. Inactive product.",
    });

    // Seed cart for root user
    await UserRepository.upsertCartItem(root.id, prod1.id, 2);
    await UserRepository.upsertCartItem(root.id, prod4.id, 3);

    // Orders
    await OrderRepository.create({
        userId: root.id,
        email: "oldpsw@root.it",
        products: [
            {
                product: {
                    id: prod1.id,
                    title: prod1.title,
                    price: prod1.price,
                    imageUrl: prod1.imageUrl,
                    active: prod1.active,
                    description: prod1.description,
                },
                quantity: 1
            },
        ],
    });
    await OrderRepository.create({
        userId: root.id,
        email: "root@root.it",
        products: [
            {
                product: {
                    id: prod4.id,
                    title: prod4.title,
                    price: prod4.price,
                    imageUrl: prod4.imageUrl,
                    active: prod4.active,
                    description: prod4.description,
                },
                quantity: 20
            }
        ],
    });

    return response.redirect('/');
};
