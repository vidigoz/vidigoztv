-- Migración: soporte de reenvíos (VidigozTV / Taller)
-- Agrega resend_mode a `sends` para que un reenvío programado sepa a quién debe llegarle
-- cuando el cron lo dispare más tarde (el envío inmediato ya lo recibe como parámetro directo).
-- Idempotente: seguro de correr más de una vez.

ALTER TABLE sends ADD COLUMN IF NOT EXISTS resend_mode text
  CHECK (resend_mode IS NULL OR resend_mode IN ('onlyNew', 'all'));
