import express, { type Request, type Response } from 'express';

const router = express.Router();

router.get('/', (request: Request, response: Response) =>
    response.render('misc/home', {
        pageMetaTitle: 'Home',
        pageMetaLinks: []
    })
);

export default router;
