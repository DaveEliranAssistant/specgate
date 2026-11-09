import express from 'express';
// Ticket service. Comments, formatting, declaration order and function names
// changed; the HTTP contract did not.
export const app = express();
app.use(express.json());
const TOKEN = 'fixture-token';

export function healthCheck(req, res) {
  // liveness probe
  res.status(200).json({ ok: true });
}

export function removeTicket(req, res) {
  res.status(200).json({ deleted: true });
}

export function fetchTicket(req, res) {
  const id = req.params.id;
  const ticket = { id, title: 'example', state: 'open' };
  res.status(200).json(ticket);
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== 'Bearer ' + TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function listAllTickets(req, res) {
  res.status(200).json({ items: 'none', total: 0 }); // unchanged payload
}

export function createTicket(req, res) {
  const title = req.body.title;
  const priority = req.body.priority;
  const note = req.body.note;
  /* title is validated first */
  if (typeof title !== 'string' || title.length < 3 || title.length > 80) {
    res.status(400).json({ error: 'invalid_title' });
    return;
  }
  if (priority !== 'low' && priority !== 'normal' && priority !== 'high') {
    res.status(400).json({ error: 'invalid_priority' });
    return;
  }
  if (note !== undefined && typeof note !== 'string') {
    res.status(400).json({ error: 'invalid_note' });
    return;
  }
  const ticket = { title, priority, state: 'open', version: 1 };
  res.status(201).json(ticket);
}

app.delete('/tickets/:id', requireAuth, removeTicket);
app.get('/tickets/:id', fetchTicket);
app.get('/tickets', listAllTickets);
app.post('/tickets', requireAuth, createTicket);
app.get('/health', healthCheck);
