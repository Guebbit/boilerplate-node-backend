import type { Request, Response } from 'express';
import nodemail from "../../utils/nodemailer";

/**
 * Registration form
 *
 * @param req
 * @param res
 */
export default (req: Request, res: Response) => {
    const [
        email,
        username,
        imageUrl,
    ] = req.flash('filled');

    // sonounoscoiattolo@libero.it
    // noreply@guebbit.com
    // guerzoni.andrea91@gmail.com
    // TODO
    nodemail({
        to: "sufyogofyu@gufum.com",
        subject: 'Test Email Subject',
        text: 'Hello, this is a test email sent from my domain using Nodemailer.',
        html: '<b>Hello, this is a test email sent from my domain using Nodemailer.</b>'
    })
        .then(result => {
            console.log("SUCCESSS", result)
        })
        .catch(result => {
            console.log("ERROR", result)
        })

    return res.render('account/signup', {
        pageMetaTitle: "Signup",
        pageMetaLinks: [
            "/css/auth.css",
            "/css/forms.css",
        ],
        filledInputs: {
            email,
            username,
            imageUrl,
        },
    });
}