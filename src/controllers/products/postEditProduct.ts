import type { Request, Response } from "express";
import type { CastError } from "mongoose";
import Products from "../../models/products";

/**
 * Page POST data
 */
export interface postEditProductsPostData {
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
export default (req: Request<{}, {}, postEditProductsPostData>, res: Response) => {
    /**
     * get POST data
     */
    const {
        id,
        title = "",
        imageUrl = "",
        price = "0",
        description = "",
        active
    } = req.body;

    /**
     * Data validation
     */
    const issues = Products.validateData({
        title,
        imageUrl,
        price: parseInt(price),
        description,
        active: !!active
    });

    /**
     * Validation error
     */
    if(issues.length > 0){
        req.flash('error', issues);
        req.flash('filled', [
            title,
            imageUrl,
            price,
            description,
            active,
        ]);
        if (!id || id === '')
            res.redirect('/products/add');
        else
            res.redirect('/products/edit/' + id);
        return;
    }

    /**
     * NO ID = new product
     */
    if (!id || id === '')
        Products.create({
            title,
            imageUrl,
            price: parseInt(price),
            description,
            active: !!active,
        })
            .then(() => res.redirect('/products/'))
            .catch((error: CastError) => {
                console.log("Products.create ERROR", error);
                return res.redirect('/error/unknown');
            });
    /**
     * ID = edit product
     */
    else
        Products.findById(id)
            .then((product) => {
                if (!product)
                    throw new Error("404");
                product.title = title;
                product.imageUrl = imageUrl;
                product.price = parseInt(price);
                product.description = description;
                product.active = !!active;
                return product.save();
            })
            .then((product) => res.redirect('/products/details/' + product.id))
            .catch((error: CastError) => {
                console.log("Products.findById ERROR", error);
                return res.redirect('/error/unknown');
            });
};