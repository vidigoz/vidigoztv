-- Migración: sistema de newsletter (VidigozTV / Taller)
-- Tablas nuevas en el mismo Postgres compartido (vidigoztv_db_id) que ya usa `events`.
-- Idempotente: seguro de correr más de una vez.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Suscriptores ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE NOT NULL,
  nombre             text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'active', 'unsubscribed', 'bounced')),
  origen             text,
  confirm_token      text,
  unsubscribe_token  text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz,
  unsubscribed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email             ON subscribers (email);
CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token      ON subscribers (confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token  ON subscribers (unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_status              ON subscribers (status);

-- ── Envíos (uno por historia enviada / programada) ──────────────────────────
CREATE TABLE IF NOT EXISTS sends (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id     text,
  subject            text,
  scheduled_at       timestamptz,
  sent               boolean NOT NULL DEFAULT false,
  sent_at            timestamptz,
  recipients_count   integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sends_scheduled_at ON sends (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sends_sent          ON sends (sent);
CREATE INDEX IF NOT EXISTS idx_sends_notion_page_id ON sends (notion_page_id);

-- ── Eventos de envío (rebotes, quejas, bajas) — historial/log ──────────────
CREATE TABLE IF NOT EXISTS send_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id            uuid REFERENCES sends (id) ON DELETE CASCADE,
  subscriber_id      uuid REFERENCES subscribers (id) ON DELETE CASCADE,
  event_type         text NOT NULL
                       CHECK (event_type IN ('delivered', 'bounced', 'complained', 'unsubscribed')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_events_send_id       ON send_events (send_id);
CREATE INDEX IF NOT EXISTS idx_send_events_subscriber_id ON send_events (subscriber_id);

-- ── Destinatarios por envío (para open rate / click rate) ──────────────────
CREATE TABLE IF NOT EXISTS send_recipients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id            uuid REFERENCES sends (id) ON DELETE CASCADE,
  subscriber_id      uuid REFERENCES subscribers (id) ON DELETE CASCADE,
  resend_email_id    text,
  delivered_at       timestamptz,
  opened_at          timestamptz,
  first_clicked_at   timestamptz,
  bounced_at         timestamptz,
  complained_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_send_recipients_send_id        ON send_recipients (send_id);
CREATE INDEX IF NOT EXISTS idx_send_recipients_subscriber_id  ON send_recipients (subscriber_id);
CREATE INDEX IF NOT EXISTS idx_send_recipients_resend_email_id ON send_recipients (resend_email_id);
