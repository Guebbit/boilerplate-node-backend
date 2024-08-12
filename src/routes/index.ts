import express from 'express';
import getHome from "../controllers/get-home";
import getHeavyLoad from "../controllers/get-heavy-load";
import getResetDatabase from "../controllers/get-reset-database";

const router = express.Router();

router.get('/', getHome);

router.get('/reset-database', getResetDatabase);

router.get('/heavy', getHeavyLoad);

export default router;
