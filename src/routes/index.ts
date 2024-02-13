import express from 'express';
import getHome from "../controllers/getHome";
import getCheckout from "../controllers/getCheckout";
import { isAuth } from "../middlewares/authorizations";

const router = express.Router();

router.get('/', getHome);

router.get('/checkout', isAuth, getCheckout);

export default router;
