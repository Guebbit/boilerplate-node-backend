import express from 'express';
import getHome from "../controllers/get-home";
import postGenerateDatabase from "../controllers/post-penerate-database";

const router = express.Router();

router.get('/', getHome);
router.post('/generate-database', postGenerateDatabase);

export default router;
