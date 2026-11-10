import { Request, Response, NextFunction } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

const read = (req: Request): string | null => {
  const header = req.headers.authorization;
  return header && header.startsWith('Token ') ? header.slice(6) : null;
};

const guard: { required: Handler; optional: Handler } = {
  required: (req, res, next) => {
    if (!read(req)) {
      res.status(401).json({ message: 'unauthorized' });
      return;
    }
    next();
  },
  optional: (req, res, next) => {
    next();
  },
};

export default guard;
