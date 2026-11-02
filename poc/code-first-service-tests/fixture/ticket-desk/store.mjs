// SYNTHETIC FIXTURE — in-memory dependency of ticket-desk.
// Not a database. Discovery records exports and object-literal keys.
// Map access and assignments are reported as unsupported and are not used as expectations.

const tickets = new Map();
let seq = 0;

export function resetStore() {
  tickets.clear();
  seq = 0;
}

export function createTicket(input) {
  const title = input.title;
  const priority = input.priority;
  const rawBody = input.body;
  let storedBody = '';
  if (rawBody !== undefined) {
    storedBody = rawBody;
  }
  seq = seq + 1;
  const id = String(seq);
  const ticket = { id, title, priority, body: storedBody, status: 'open' };
  tickets.set(id, ticket);
  return ticket;
}

export function getTicket(id) {
  return tickets.get(id);
}

export function updateTicketStatus(id, status) {
  const existing = tickets.get(id);
  if (!existing) {
    return null;
  }
  const updated = { id: existing.id, title: existing.title, priority: existing.priority, body: existing.body, status };
  tickets.set(id, updated);
  return updated;
}
