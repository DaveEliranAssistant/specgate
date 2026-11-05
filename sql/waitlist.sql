-- Idempotent SpecGate waitlist table. Safe to run more than once.
-- Stores a normalized email, consent, source, a user-agent hash, and created_at.
-- It does not store an IP address.

CREATE TABLE IF NOT EXISTS waitlist_signups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  consent boolean NOT NULL CHECK (consent),
  source text NOT NULL,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
