import express from 'express';
export const app = express();
app.use(express.json());
const TOKEN = 'fixture-token';

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer ' + TOKEN) { res.status(401).json({ error: 'unauthorized' }); return; }
  next();
}

export function createTicket(req, res) {
  const title = req.body.title;
  const priority = req.body.priority;
  const note = req.body.note;
  if (typeof title !== 'string' || title.length < 3 || title.length > 80) { res.status(422).json({ error: 'invalid_title' }); return; }
  if (priority !== 'low' && priority !== 'normal' && priority !== 'high') { res.status(400).json({ error: 'invalid_priority' }); return; }
  if (note !== undefined && typeof note !== 'string') { res.status(400).json({ error: 'invalid_note' }); return; }
  const ticket = { title, priority, state: 'open', version: 1 };
  res.status(201).json(ticket);
}

export function listTickets(req, res) {
  res.status(200).json({ items: 'none', total: 0 });
}

export function getTicket(req, res) {
  const id = req.params.id;
  const ticket = { id, title: 'example', state: 'open' };
  res.status(200).json(ticket);
}

export function deleteTicket(req, res) {
  res.status(200).json({ deleted: true });
}

export function health(req, res) {
  res.status(200).json({ ok: true });
}

app.get('/health', health);
app.post('/tickets', requireAuth, createTicket);
app.get('/tickets', listTickets);
app.get('/tickets/:id', getTicket);
app.delete('/tickets/:id', requireAuth, deleteTicket);
