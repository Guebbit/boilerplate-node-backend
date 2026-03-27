import type { Request, Response } from "express";
import sequelize from "@utils/database";
import { CartItemModel } from "@models/users";
import UserRepository from "@repositories/users";
import ProductRepository from "@repositories/products";
import OrderRepository from "@repositories/orders";

/**
 * Create example database (reset to demo data)
 *
 * @param request
 * @param response
 */
export const getResetDatabase = async (request: Request, response: Response) => {
    // Drop and recreate all tables
    await sequelize.sync({ force: true });

    // Create users
    const [adminUser] = await Promise.all([
        UserRepository.create({
            username: "root",
            email: "root@root.it",
            password: "rootroot",
            imageUrl: "/images/9726c4217f5998511f372afab4800ac8.jpg",
            admin: true,
        }),
        UserRepository.create({
            username: "ginopinoshow",
            email: "gino@pino.it",
            password: "$2b$12$HwOdA7il/qvuU.psvWDOyuSMJ7ji/qMeFS3ma7DB8W6A/tGfCYEX.",
            imageUrl: "/images/96346b77daf138a279677cb75c400ee9.jpg",
            admin: false,
        }),
    ]);

    // Create products
    const products = await Promise.all([
        ProductRepository.create({
            title: "Sallyno Panino",
            price: 100,
            imageUrl: "/images/ad2e01890eebf72d06481c4fac3522ac.jpg",
            active: true,
            description: "Piccolo Sallyno panino. Da mangiare di coccole",
        }),
        ProductRepository.create({
            title: "Sallyno Carino",
            price: 50,
            imageUrl: "/images/96346b77daf138a279677cb75c400ee9.jpg",
            active: true,
            description: "Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.",
            deletedAt: new Date('2024-02-26T23:34:44.832Z'),
        }),
        ProductRepository.create({
            title: "Miciona inutile",
            price: 1,
            imageUrl: "/images/60de15db7aed7174ef2d53d21e1f57a5.jpg",
            active: true,
            description: "Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire",
        }),
        ProductRepository.create({
            title: "Micino pufettino",
            price: 77,
            imageUrl: "/images/f12ba2e44fe347010397f1dcba399808.jpg",
            active: true,
            description: "Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.",
        }),
        ProductRepository.create({
            title: "Bundle micini",
            price: 40,
            imageUrl: "/images/043cf5b2517fc99ce9a2c2f84288416d.jpg",
            active: false,
            description: "Produttori di rumori molesti a tutte le ore. Inactive product.",
        }),
    ]);
    const p1 = products[0];
    const p4 = products[3];

    // Create orders
    await Promise.all([
        OrderRepository.create(
            { userId: adminUser.id, email: "oldpsw@root.it" },
            [
                { productId: p1.id, title: p1.title, price: p1.price, imageUrl: p1.imageUrl, description: p1.description, quantity: 1 },
            ],
        ),
        OrderRepository.create(
            { userId: adminUser.id, email: "root@root.it" },
            [
                { productId: p4.id, title: p4.title, price: p4.price, imageUrl: p4.imageUrl, description: p4.description, quantity: 20 },
            ],
        ),
    ]);

    // Add cart items for admin user
    await CartItemModel.bulkCreate([
        { userId: adminUser.id, productId: p1.id, quantity: 2 },
        { userId: adminUser.id, productId: p4.id, quantity: 3 },
    ]);

    return response.redirect('/');
};
