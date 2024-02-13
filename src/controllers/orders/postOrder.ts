import type { Request, Response } from "express";

/**
 * Create a new order using the current user cart,
 * then empty the cart
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    if(!req.user)
        return res.redirect('/account/login');
    req.user
        .getCart()
        .then((cart) =>
            cart.getProducts()
                .then((products) => {
                    return {
                        cart,
                        products
                    }
                })
        )
        .then(({ cart, products }) => {
            if(products.length < 1)
                throw new Error("empty");
            return req.user!.createOrder()
                .then((order) =>
                    Promise.all([
                        ...products.map((product) => {
                            return order.addProduct(product, {
                                through: {
                                    quantity: product.CartItems.quantity
                                }
                            })
                        }),
                        cart.removeProducts(products),
                    ])
                )
                .then(() => res.redirect('/orders'))
        })
};