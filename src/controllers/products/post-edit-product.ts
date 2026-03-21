import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import Products from "../../models/products";
import { deleteFile } from "../../utils/filesystem-helpers";
import { databaseErrorConverter, ExtendedError } from "../../utils/error-helpers";
import type { DatabaseError, ValidationError } from "sequelize";
import type { UpdateProductRequestBody } from "@api/api";

/**
 * Create new product
 * If productId is provided: Edit target product
 *
 * @param request
 * @param response
 * @param next
 */
export const postEditProduct = async (request: Request<unknown, unknown, UpdateProductRequestBody>, response: Response, next: NextFunction) => {
    const {
        id,
        title,
        description = "",
        active
    } = request.body;
    const price = Number.parseInt(request.body.price);

    /**
     * Get URL of updated image it's on request.file,
     * but it's good to know that it could be within an array
     */
    const imageUrlRaw = (request.file ? request.file.path : (request.files ? (request.files as Express.Multer.File[])[0].path : ""));
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw.replace("public", "");

    /**
     * Data validation
     */
    const issues = Products.validateData({
        title,
        imageUrl,
        price,
        description,
        active: !!active
    });

    /**
     * Validation error
     */
    if (issues.length > 0) {
        // Record was not created, so revert server changes by removing the uploaded file
        if (imageUrlRaw.length > 0)
            await deleteFile(imageUrlRaw);
        request.flash('error', issues);
        request.flash('filled', Object.values(request.body));
        if (!id || id === '')
            return response.redirect('/products/add');
        return response.redirect('/products/edit/' + id);
    }

    /**
     * No ID = new product
     */
    if (!id || id === '')
        Products.create({
            title,
            imageUrl,
            price,
            description,
            active: !!active,
        })
            .then(() => response.redirect('/products/'))// response.redirect('/products/details/' + product.id)
            .catch(async (error: Error | ValidationError | DatabaseError) => {
                if (imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                next(databaseErrorConverter(error));
            })
    /**
     * ID = edit product
     */
    else
        (
            request.session.user?.admin ?
                Products.scope("admin") :
                Products
        ).findByPk(id)
            .then(async (product) => {
                // trying to edit a product that doesn't exist
                if (!product) {
                    if (imageUrlRaw.length > 0)
                        await deleteFile(imageUrlRaw);
                    next(new ExtendedError("404", 404, true, [ t("ecommerce.product-not-found") ]));
                    return;
                }
                product.title = title;
                product.imageUrl = imageUrl;
                product.price = price;
                product.description = description;
                product.active = !!active;
                return product.save();
            })
            .then(async (product) => {
                if (!product) {
                    if (imageUrlRaw.length > 0)
                        await deleteFile(imageUrlRaw);
                    next(new ExtendedError("404", 404, false, [ t("ecommerce.product-not-found") ]));
                    return;
                }
                return response.redirect('/products/details/' + product.id);
            })
            .catch(async (error: Error | ValidationError | DatabaseError) => {
                if (imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                next(databaseErrorConverter(error));
            })
};