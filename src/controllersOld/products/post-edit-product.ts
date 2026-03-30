import type {Request, Response} from "express";
import type {CastError} from "mongoose";
import Products from "../../models/products";
import {deleteFile} from "../../utils/helpers-filesystem";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import {rejectResponse, successResponse} from "../../utils/response";
import {t} from "i18next";
import {getFormFiles} from "../../utils/helpers-files";

/**
 *
 */
export interface IGetEditProductsPostData {
    id?: string
}


/**
 * Page POST data
 */
export interface IPostEditProductsPostData {
    id?: string,
    title?: string,
    price?: string,
    description?: string,
    active?: "0" | "1",
}

/**
 *
 * @param req
 * @param res
 */
export default async (req: Request<IGetEditProductsPostData, unknown, Partial<IPostEditProductsPostData>>, res: Response) => {

    /**
     * get POST data
     */
    const {
        title = "",
        price = "0",
        description = ""
    } = req.body;
    const active = req.body.active ? (
        req.body.active === "1" ? true : false
    ) : undefined;
    const id = req.params.id ?? req.body.id;
    const createMode = !id || id === '';

    /**
     * Get URL of updated image it's on req.file,
     * but it's good to know that it could be within an array
     * If no image was uploaded: it's empty
     * If image was uploaded: delete the old one (if any) on save
     */
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const imageUrlRaw = getFormFiles(req as Request)?.[0] as string | undefined;
    // remove "public" at root ("/" remain as root)
    const imageUrl = imageUrlRaw ? imageUrlRaw.replace((process.env.NODE_PUBLIC_PATH ?? "public"), "") : "";

    /**
     * Data validation
     */
    const issues = Products.validateData({
        title,
        imageUrl,
        price: Number.parseInt(price),
        description,
        active
        // edit = partial
    }, !createMode);

    /**
     * Validation error
     */
    if (issues.length > 0) {
        // Record was not created, so revert server changes by removing the uploaded file
        if (imageUrlRaw && imageUrlRaw.length > 0)
            await deleteFile(imageUrlRaw);
        rejectResponse(res, 400, "errors", issues)
        return;
    }

    /**
     * NO ID = new product
     */
    if (createMode)
        Products.create({
            title,
            imageUrl,
            price: Number.parseInt(price),
            description,
            active,
        })
            .then((product) => successResponse(res, product))
            .catch(async (error: CastError) => {
                if (imageUrlRaw && imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                return rejectResponse(res, ...databaseErrorInterpreter(error))
            });
    /**
     * ID = edit product
     */
    else
        Products.findById(id)
            .then(async (product) => {
                if (!product) {
                    rejectResponse(res, 404, t("ecommerce.product-not-found"))
                    return
                }

                // if empty: no image was uploaded
                const oldImageUrl = product.imageUrl;
                const imageIsUploaded = oldImageUrl && imageUrl && oldImageUrl !== imageUrl;
                if (imageIsUploaded)
                    product.imageUrl = imageUrl;
                if (title)
                    product.title = title;
                if (price)
                    product.price = Number.parseInt(price);
                if (description)
                    product.description = description;
                if(active !== undefined)
                    product.active = active;

                // save the updated product (not necessary to use newProduct variable since the ID doesn't change, but normally it would be necessary)
                const newProduct = await product.save();
                // after saving the new product image, delete the old one
                if (imageIsUploaded)
                    await deleteFile((process.env.NODE_PUBLIC_PATH ?? "public") + oldImageUrl);
                return successResponse(res, newProduct)
            })
            .catch(async (error: CastError) => {
                if (imageUrlRaw && imageUrlRaw.length > 0)
                    await deleteFile(imageUrlRaw);
                if (error.message == "404" || error.kind === "ObjectId")
                    return rejectResponse(res, 404, t("ecommerce.product-not-found"))
                return rejectResponse(res, ...databaseErrorInterpreter(error))
            });
};