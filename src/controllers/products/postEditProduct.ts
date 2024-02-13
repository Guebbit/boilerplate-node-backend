import type { Request, Response } from "express";
import Products from "../../models/products";

/**
 *
 */
export interface postEditProductsBodyParameters {
    id: string,
    title: string,
    imageUrl: string,
    price: string,
    description: string,
    active: string,
}
/**
 *
 * @param req
 * @param res
 */
export default (req: Request<{}, {}, postEditProductsBodyParameters>, res: Response) => {
    const {
        id,
        title = "",
        imageUrl = "",
        price = "0",
        description = "",
        active
    } = req.body;

    /**
     * No ID = new product
     */
    if (!id || id === '')
        Products.create({
            title,
            imageUrl,
            price: parseInt(price),
            description,
            active: !!active,
        })
            .then((product) => {
                console.log("Products.create OK", product)
                // return res.redirect('/products/details/' + product.id);
                return res.redirect('/products/');
            })
            .catch((err) => {
                console.log("Products.create ERROR", err);
                return res.redirect('/error/unknown');
            });
    /**
     * ID = edit product
     */
    else
        Products.findByPk(id)
            .then((product) => {
                if (!product)
                    throw 404;
                product.title = title;
                product.imageUrl = imageUrl;
                product.price = parseInt(price);
                product.description = description;
                product.active = !!active;
                // product.updatedAt = new Date();
                return product.save();
            })
            .then((product) => {
                console.log("Products.findByPk EDIT OK", product)
                return res.redirect('/products/details/' + product.id);
            })
            .catch((err) => {
                console.log("Products.findByPk ERROR", err);
                return res.redirect('/error/unknown');
            });
};