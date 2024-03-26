import express from 'express';
import getHome from "../controllers/getHome";
import postGenerateDatabase from "../controllers/postGenerateDatabase";

const router = express.Router();

router.get('/', getHome);
router.post('/generate-database', postGenerateDatabase);

export default router;
