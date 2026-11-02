// SYNTHETIC FIXTURE — not a real service.
// Validates literal Express route discovery only. No production data.
// The approved credential is baseline/behavior-baseline.json.
// This constant exists so the process can boot. Tests must not read it.

import express from 'express';
import { createTicket, getTicket, updateTicketStatus } from './store.mjs';

export const app = express();
app.use(express.json());

export const BEARER_TOKEN = 'synthetic-token';

export function requireBearer(req, res, next) {
  const header = req.headers.authorization;
  if (header !== 'Bearer ' + BEARER_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function healthHandler(req, res) {
  res.status(200).json({ ok: true });
}

export function createTicketHandler(req, res) {
  const title = req.body.title;
  const priority = req.body.priority;
  const body = req.body.body;
  if (typeof title !== 'string') {
    res.status(400).json({ error: 'title_type' });
    return;
  }
  if (title.length < 1 || title.length > 80) {
    res.status(400).json({ error: 'title_length' });
    return;
  }
  if (priority !== 'low' && priority !== 'normal' && priority !== 'high') {
    res.status(400).json({ error: 'priority_enum' });
    return;
  }
  if (body !== undefined && (typeof body !== 'string' || body.length > 500)) {
    res.status(400).json({ error: 'body_length' });
    return;
  }
  const ticket = createTicket({ title, priority, body });
  res.status(201).json(ticket);
}

export function getTicketHandler(req, res) {
  const ticket = getTicket(req.params.id);
  if (!ticket) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(ticket);
}

export function updateStatusHandler(req, res) {
  const status = req.body.status;
  if (status !== 'open' && status !== 'closed') {
    res.status(400).json({ error: 'status_enum' });
    return;
  }
  const ticket = updateTicketStatus(req.params.id, status);
  if (!ticket) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(ticket);
}

app.post('/tickets', createTicketHandler);
app.get('/tickets/:id', requireBearer, getTicketHandler);
app.patch('/tickets/:id', requireBearer, updateStatusHandler);
app.get('/health', healthHandler);
