// Outgoing mail (plan §4.16): smtp (a Gmail account with an app password in v1), file (dev: each
// message as an .eml in MAIL_DIR, so a developer can read a code without it reaching a log) or
// memory (tests and the dashboard's e2e). Never logs a message, an address or a code.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

/** A send that failed. Carries only the transport's error code (EAUTH, ETIMEDOUT…). */
export class MailError extends Error {
  constructor(code) {
    super(code ? `mail_failed (${code})` : 'mail_failed');
    this.code = code;
  }
}

/** mail: settings.mail. → {kind, send({to, subject, text, html})}; memory adds `sent` and `fail`. */
export function createMailer(mail) {
  if (mail.transport === 'memory') {
    return {
      kind: 'memory',
      sent: [],
      fail: false,   // tests set it to make every send throw
      async send(message) {
        if (this.fail) throw new MailError('EMEMORY');
        this.sent.push({ from: mail.from, ...message });
      },
    };
  }
  const transport = mail.transport === 'smtp'
    ? nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === 465,
      auth: { user: mail.user, pass: mail.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  return {
    kind: mail.transport,
    async send({ to, subject, text, html }) {
      let info;
      try {
        info = await transport.sendMail({ from: mail.from, to, subject, text, html });
      } catch (err) {
        throw new MailError(err?.code);
      }
      if (mail.transport === 'file') {
        fs.mkdirSync(mail.dir, { recursive: true });
        fs.writeFileSync(path.join(mail.dir, `${Date.now()}-${crypto.randomUUID()}.eml`), info.message);
      }
    },
  };
}

const LEADS = {
  welcome: 'Your FuelBot dashboard account is ready. Sign in with the temporary password your admin '
    + 'gives you, then enter this code to choose your own password.',
  reset_by_admin: 'Your admin set a new temporary password for your FuelBot dashboard account. Sign in '
    + 'with it, then enter this code to choose your own password.',
  forgot: 'Someone asked to reset the password of your FuelBot dashboard account. Enter this code on '
    + 'the reset page to choose a new password.',
  requested: 'Here is the code you asked for. Enter it to choose your password.',
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The code email for a purpose (welcome | reset_by_admin | forgot | requested). → {subject, text, html} */
export function codeMail({ code, expiresAt, purpose, settings }) {
  const lead = LEADS[purpose];
  if (!lead) throw new Error(`codeMail: unknown purpose ${purpose}`);
  const until = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.displayTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(expiresAt);
  const url = `${settings.publicUrl}/dashboard/`;
  const valid = `It's valid for 30 minutes (until ${until}).`;
  const ignore = "If you didn't ask for this, you can ignore this email.";
  const text = [lead, '', `Your code: ${code}`, valid, '', `Dashboard: ${url}`, '', ignore, ''].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.5">
<p>${escapeHtml(lead)}</p>
<p style="font-family:'Courier New',monospace;font-size:28px;font-weight:bold;letter-spacing:6px;margin:24px 0">${escapeHtml(code)}</p>
<p>${escapeHtml(valid)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
<p style="color:#666;font-size:13px">${escapeHtml(ignore)}</p>
</body></html>`;
  return { subject: `Your FuelBot code: ${code}`, text, html };
}
