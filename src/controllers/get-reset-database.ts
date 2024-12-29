import type {Request, Response} from "express";
import db from '../utils/db';
import Users from "../models/users";
import Products from "../models/products";
import Orders from "../models/orders";
import OrderItems from "../models/order-items";
import Carts from "../models/carts";
import CartItems from "../models/cart-items";
import Tokens from "../models/tokens";


/**
 * Create example database
 * Could add "unzipper" to unzip images backup folder automatically but don't want to add unnecessary dependencies
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) =>
    // Can't do db.drop() because I would incur in a session error
    // Can't do Promise.all because relations would break
    // Needs of clear timings in the insertion because of the various foreign key restrictions (due to relations)
    CartItems.drop()
        .then(() => Carts.drop())
        .then(() => OrderItems.drop())
        .then(() => Orders.drop())
        .then(() => Tokens.drop())
        .then(() => Users.drop())
        .then(() => Products.drop())
        .then(() => db.sync())
        .then(() =>
            Promise.all([
                Users.create({
                    id: 1,
                    email: 'root@root.it',
                    username: 'Root',
                    password: 'rootroot',
                    imageUrl: String.raw`\images\9726c4217f5998511f372afab4800ac8.jpg`,
                    admin: true,
                    active: true,
                }),
                    // .then((user) => user.createCart()),
                Users.create({
                    id: 2,
                    email: 'test@test.com',
                    username: 'Test',
                    password: 'testtest',
                    imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
                    admin: false,
                    active: true,
                }),
                    // .then((user) => user.createCart()),

                Products.create({
                    "id": 1,
                    "title": "Sallyno Panino",
                    "price": 100,
                    "imageUrl": String.raw`\images\ad2e01890eebf72d06481c4fac3522ac.jpg`,
                    "active": true,
                    "description": "Piccolo Sallyno panino. Da mangiare di coccole",
                }),
                Products.create({
                    "id": 2,
                    "title": "Sallyno Carino",
                    "price": 50,
                    "imageUrl": String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
                    "active": true,
                    "description": "Sallyno incredibilmente carino. Illegale in 400 paesi. Soft deleted product.",
                })
                    .then(product => product.destroy()),
                Products.create({
                    "id": 3,
                    "title": "Miciona inutile",
                    "price": 1,
                    "imageUrl": String.raw`\images\60de15db7aed7174ef2d53d21e1f57a5.jpg`,
                    "active": true,
                    "description": "Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire",
                }),
                Products.create({
                    "id": 4,
                    "title": "Micino pufettino",
                    "price": 77,
                    "imageUrl": String.raw`\images\f12ba2e44fe347010397f1dcba399808.jpg`,
                    "active": true,
                    "description": "Micino pufettino, incredibilmente pufino. Illegale in 400 paesi.",
                }),
                Products.create({
                    "id": 5,
                    "title": "Bundle micini",
                    "price": 40,
                    "imageUrl": String.raw`\images\043cf5b2517fc99ce9a2c2f84288416d.jpg`,
                    "active": false,
                    "description": "Produttori di rumori molesti a tutte le ore. Inactive product.",
                }),
            ])
        )
        .then(() =>
            Promise.all([
                Carts.create({
                    id: 1,
                    // @ts-expect-error should use instances but this is faster
                    UserId: 1,
                }),
                Carts.create({
                    id: 2,
                    // @ts-expect-error should use instances but this is faster
                    UserId: 2,
                }),

                Orders.create({
                    id: 1,
                    email: 'oldpsw@root.it',
                    UserId: 1
                }),
                Orders.create({
                    id: 2,
                    email: 'root@root.it',
                    UserId: 1
                }),
            ])
        )
        .then(() =>
            Promise.all([
                OrderItems.create({
                    id: 1,
                    quantity: 5,
                    // @ts-expect-error should use instances but this is faster
                    OrderId: 1,
                    ProductId: 1
                }),
                OrderItems.create({
                    id: 2,
                    quantity: 10,
                    // @ts-expect-error should use instances but this is faster
                    OrderId: 1,
                    ProductId: 3
                }),
                OrderItems.create({
                    id: 3,
                    quantity: 20,
                    // @ts-expect-error should use instances but this is faster
                    OrderId: 2,
                    ProductId: 4
                }),
                CartItems.create({
                    id: 1,
                    quantity: 2,
                    CartId: 1,
                    // @ts-expect-error difficulties with sequelize inferred types
                    ProductId: 1
                }),
                CartItems.create({
                    id: 2,
                    quantity: 3,
                    CartId: 1,
                    // @ts-expect-error difficulties with sequelize inferred types
                    ProductId: 3
                }),
            ])
        )
        .then(() => res.redirect('/'))



