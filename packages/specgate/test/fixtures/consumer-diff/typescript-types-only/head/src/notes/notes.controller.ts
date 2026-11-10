import { NextFunction, Request, Response, Router } from 'express';
import guard from '../guard';
import { listNotes, getNote } from './notes.service';

interface NoteQuery { tag?: string; limit?: number }

const router = Router();

router.get('/notes', guard.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notes = await listNotes(req.query as NoteQuery);
    res.json({ notes });
  } catch (error) {
    next(error);
  }
});

router.get('/notes/:noteId', guard.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ note: await getNote(req.params.noteId) });
  } catch (error) {
    next(error);
  }
});

export default router;
