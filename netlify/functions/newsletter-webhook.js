// POST /.netlify/functions/newsletter-webhook
// Recibe eventos de Resend (delivered, bounced, complained, opened, clicked) y actualiza
// subscribers / send_recipients / send_events.
//
// Configurar en el dashboard de Resend: Webhooks → añadir esta URL, eventos:
// email.delivered, email.bounced, email.complained, email.opened, email.clicked.
//
// Verificación de firma: Resend firma sus webhooks con Svix (headers svix-id / svix-timestamp
// / svix-signature) usando un secret que se genera al crear el webhook en su dashboard.
// Se guarda como RESEND_WEBHOOK_SECRET (mismo patrón fallback-a-.env que las demás
// credenciales). Si no está configurado, el webhook sigue funcionando pero sin verificar
// firma (documentado explícitamente — no bloquea el desarrollo mientras no exista el secret).
const crypto = require('crypto');
const { getPool } = require('./_shared/db');

function getWebhookSecret() {
  let secret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!secret) {
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '..', '.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      const m = envContent.match(/^RESEND_WEBHOOK_SECRET\s*=\s*(.+)$/m);
      if (m) secret = m[1].trim();
    } catch {
      // sin .env disponible
    }
  }
  return secret;
}

// Verificación de firma Svix (usada por Resend). https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
function verifySvixSignature(event, secret) {
  if (!secret) return true; // sin secret configurado, no se puede verificar — se documenta como pendiente

  const headers = event.headers || {};
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${event.body}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  const candidates = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean);
  return candidates.some((c) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = getWebhookSecret();
  if (!verifySvixSignature(event, secret)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Firma inválida' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const type = payload.type; // ej: "email.bounced"
  const data = payload.data || {};
  const resendEmailId = data.email_id || data.id;
  const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;

  if (!type || !resendEmailId) {
    return { statusCode: 200, body: JSON.stringify({ ignored: true }) };
  }

  const db = getPool();

  try {
    // Ubicar el destinatario por resend_email_id (o por email como respaldo).
    let recipient;
    const byId = await db.query('SELECT * FROM send_recipients WHERE resend_email_id = $1 LIMIT 1', [resendEmailId]);
    if (byId.rowCount > 0) {
      recipient = byId.rows[0];
    } else if (toEmail) {
      const bySub = await db.query(
        `SELECT sr.* FROM send_recipients sr
         JOIN subscribers s ON s.id = sr.subscriber_id
         WHERE s.email = $1 ORDER BY sr.delivered_at DESC NULLS LAST LIMIT 1`,
        [toEmail]
      );
      if (bySub.rowCount > 0) recipient = bySub.rows[0];
    }

    if (type === 'email.delivered' && recipient) {
      await db.query('UPDATE send_recipients SET delivered_at = now() WHERE id = $1', [recipient.id]);
    }

    if (type === 'email.opened' && recipient) {
      await db.query('UPDATE send_recipients SET opened_at = COALESCE(opened_at, now()) WHERE id = $1', [recipient.id]);
    }

    if (type === 'email.clicked' && recipient) {
      await db.query('UPDATE send_recipients SET first_clicked_at = COALESCE(first_clicked_at, now()) WHERE id = $1', [recipient.id]);
    }

    if (type === 'email.bounced') {
      if (recipient) await db.query('UPDATE send_recipients SET bounced_at = now() WHERE id = $1', [recipient.id]);
      if (toEmail) {
        const sub = await db.query(`UPDATE subscribers SET status = 'bounced' WHERE email = $1 RETURNING id`, [toEmail]);
        if (sub.rowCount > 0 && recipient) {
          await db.query(
            `INSERT INTO send_events (send_id, subscriber_id, event_type) VALUES ($1, $2, 'bounced')`,
            [recipient.send_id, sub.rows[0].id]
          );
        }
      }
    }

    if (type === 'email.complained') {
      if (recipient) await db.query('UPDATE send_recipients SET complained_at = now() WHERE id = $1', [recipient.id]);
      if (toEmail) {
        const sub = await db.query(
          `UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = now() WHERE email = $1 RETURNING id`,
          [toEmail]
        );
        if (sub.rowCount > 0 && recipient) {
          await db.query(
            `INSERT INTO send_events (send_id, subscriber_id, event_type) VALUES ($1, $2, 'complained')`,
            [recipient.send_id, sub.rows[0].id]
          );
        }
      }
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
