import type { Request, Response } from 'express';
import { userRepository } from '@repositories/users';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';
import { syncSchema } from '@utils/database';

export const getResetDatabase = (_request: Request, response: Response) =>
    syncSchema(true)
        .then(() =>
            Promise.all([
                userRepository.create({
                    username: 'root',
                    email: 'root@root.it',
                    password: 'rootroot',
                    imageUrl: String.raw`\images\9726c4217f5998511f372afab4800ac8.jpg`,
                    admin: true,
                    cart: { items: [], updatedAt: new Date() },
                    tokens: []
                }),
                userRepository.create({
                    username: 'ginopinoshow',
                    email: 'gino@pino.it',
                    password: 'rootroot',
                    imageUrl: String.raw`\images\96346b77daf138a279677cb75c400ee9.jpg`,
                    admin: false,
                    cart: { items: [], updatedAt: new Date() },
                    tokens: []
                })
            ])
        )
        .then(([root]) =>
            Promise.all([
                productRepository.create({
                    title: 'Sallyno Panino',
                    price: 100,
                    imageUrl: String.raw`\images\ad2e01890eebf72d06481c4fac3522ac.jpg`,
                    active: true,
                    description: 'Piccolo Sallyno panino. Da mangiare di coccole'
                }),
                productRepository.create({
                    title: 'Miciona inutile',
                    price: 1,
                    imageUrl: String.raw`\images\60de15db7aed7174ef2d53d21e1f57a5.jpg`,
                    active: true,
                    description:
                        'Miciona inutile, piccolo catorcio che come lavoro produce pelo a non finire'
                }),
                root
            ])
        )
        .then(([p1, p2, root]) =>
            orderRepository.create({
                userId: root.id,
                email: 'root@root.it',
                products: [
                    { product: p1.toObject(), quantity: 1 },
                    { product: p2.toObject(), quantity: 10 }
                ]
            })
        )
        .then(() => response.redirect('/'));
