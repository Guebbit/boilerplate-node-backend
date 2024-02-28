import express from 'express';
import getHome from "../controllers/getHome";

const router = express.Router();

router.get('/', getHome);

export default router;
