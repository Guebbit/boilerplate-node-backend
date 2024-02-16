import { Request, Response } from "express";
import Products, { IProduct } from "../../models/products";

export default async (req: Request, res: Response) => {
    const productList = await Products.find().exec(); // Assuming no scope is needed for this
    const productListLC = await Products.find({ price: { $lt: 30 }, active: true }).exec(); // Applying "lowCost" scope


    const newProduct = new Products({
        title: 'Sample Product',
        price: 10.99,
        imageUrl: 'sample.jpg',
        description: 'This is a sample product.',
        active: true
    });

    newProduct.save()
        .then(savedProduct => {
            console.log('Product saved:', savedProduct);
        })
        .catch(error => {
            console.error('Error saving product:', error);
        });

    console.log("aaaaaaaaaaaaaaaAAAAAAAAA", {
        productList,
        productListLC
    })

    res.render('products/list', {
        pageMetaTitle: 'All Products',
        pageMetaLinks: [
            "/css/product.css"
        ],
        productList,
        productListLC,
    });
}


// export default (req: Request, res: Response) =>
//     Promise.all([
//         // [admin scope] rule
//         (req.session.user?.admin ? Products.unscoped() : Products )
//             .findAll(),
//         Products.scope("lowCost")
//             .findAll()
//     ])
//         .then(([productList, productListLC]) =>
//             res.render('products/list', {
//                 pageMetaTitle: 'All Products',
//                 pageMetaLinks: [
//                     "/css/product.css"
//                 ],
//                 productList,
//                 productListLC,
//             })
//         )
//         .catch((error) => {
//             console.log("getAllProducts ERROR", error)
//             return res.redirect('/error/unknown');
//         });