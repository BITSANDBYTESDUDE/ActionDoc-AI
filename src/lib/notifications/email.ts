import { ExternalServiceError } from '@/lib/errors';

/**
 * Transactional email abstraction (Resend).
 *
 * Email is a *side channel*: notifications are always written to MongoDB first,
 * and an email is only attempted afterwards. A missing RESEND_API_KEY therefore
 * degrades to in-app notifications only - it never breaks the pipeline.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. Kept simple so every client renders it predictably. */
  text: string;
  /** Optional HTML body; when omitted the text is escaped into a paragraph. */
  html?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send one email. Resolves to `false` (rather than throwing) when email is not
 * configured, so callers can treat delivery as best-effort.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.EMAIL_FROM ?? 'ActionDoc AI <notifications@actiondoc.ai>';

  // Imported lazily so the SDK stays out of any bundle that merely imports this
  // module for the configuration check.
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const html =
    input.html ??
    `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2430">${escapeHtml(
      input.text,
    ).replace(/\n/g, '<br />')}</div>`;

  try {
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
    });

    if (result.error) {
      console.error('[email] provider rejected the message', { message: result.error.message });
      return false;
    }
    return true;
  } catch (error) {
    // Never surface a delivery failure to the user's request path.
    console.error('[email] send failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Throwing variant for callers that genuinely require delivery. */
export async function sendEmailOrThrow(input: SendEmailInput): Promise<void> {
  const sent = await sendEmail(input);
  if (!sent) {
    throw new ExternalServiceError('resend', 'The email could not be sent. Check RESEND_API_KEY.');
  }
}