import { Request, Response, Router } from 'express';
import guard from '../guard';

const router = Router();

router.get('/me', guard.required, async (req: Request, res: Response) => {
  res.json({ user: (req as any).auth ?? null });
});

export default router;
