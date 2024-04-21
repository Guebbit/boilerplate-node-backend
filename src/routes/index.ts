import express from 'express';
import getHome from "../controllers/get-home";
import getHeavyLoad from "../controllers/get-heavy-load";
import postGenerateDatabase from "../controllers/post-generate-database";

const router = express.Router();

router.get('/', getHome);

router.post('/generate-database', postGenerateDatabase);

router.get("/heavy", getHeavyLoad);

export default router;
