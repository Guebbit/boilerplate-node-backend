import express from 'express';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';

export const router = express.Router();

router.get('/heavy', getHeavyLoad);
