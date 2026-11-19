import { Router } from 'express';
import { createGameSession, joinGameSession } from './gameController.js';

const router = Router();

router.post('/create', createGameSession);
router.post('/join', joinGameSession);

export default router;