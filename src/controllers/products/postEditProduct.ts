import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { deleteFile } from "../../utils/filesystem-helpers";
import { ExtendedError } from "../../utils/error-helpers";

/**
 * Page POST data
 */
export interface IPostEditProductsPostData {
    id: string,
    title: string,
    price: string,
    description: string,
    active: string,
}

/**
 * Create new product
 * If productId is provided: Edit target product
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request<unknown, unknown, IPostEditProductsPostData>, res: Response, next: NextFunction) => {

    /**
     * get POST data
     */
    const {
        id,
        title = "",
        price = "0",
        description = "",
        active
    } = req.body;

    /**
     * Get URL of updated image it's on req.file,
     * but it's good to know that it could be within an array
     */
    const imageUrlRaw = (req.file ? req.file.path : req.files ? (req.files as Express.Multer.File[])[0].path : "");
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw.replace("public", "");

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
        // Record was not created, so revert server changes by removing the uploaded file
        if(imageUrlRaw.length > 0)
            deleteFile(imageUrlRaw);
        req.flash('error', issues);
        req.flash('filled', [
            title,
            price,
            description,
            active,
        ]);
        if (!id || id === '')
            return res.redirect('/products/add');
        return res.redirect('/products/edit/' + id);
    }

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
            .then(() => res.redirect('/products/'))// res.redirect('/products/details/' + product.id)
            .catch((err) => {
                if(imageUrlRaw.length > 0)
                    deleteFile(imageUrlRaw);
                next(new ExtendedError("500", 500, err, false));
            })
    /**
     * ID = edit product
     */
    else
        (req.session.user?.admin ? Products.scope("admin") : Products).findByPk(id)
            .then((product) => {
                // trying to edit a product that doesn't exist
                if (!product){
                    if(imageUrlRaw.length > 0)
                        deleteFile(imageUrlRaw);
                    next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
                    return;
                }
                product.title = title;
                product.imageUrl = imageUrl;
                product.price = parseInt(price);
                product.description = description;
                product.active = !!active;
                return product.save();
            })
            .then((product) => {
                if(!product){
                    if(imageUrlRaw.length > 0)
                        deleteFile(imageUrlRaw);
                    next(new ExtendedError("404", 404, t("ecommerce.product-not-found")));
                    return;
                }
                return res.redirect('/products/details/' + product.id);
            })
            .catch((error) => {
                if(imageUrlRaw.length > 0)
                    deleteFile(imageUrlRaw);
                next(new ExtendedError("500", 500, error, false));
            })
};