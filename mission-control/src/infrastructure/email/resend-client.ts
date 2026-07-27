/**
 * Resend Email Client
 *
 * Reads server-only Resend credentials from the environment, following the
 * same descriptive-error style as firebase-admin.ts (normalize quotes/
 * whitespace, throw listing every missing variable) rather than introducing
 * a separate env-validation approach.
 */

import { Resend } from 'resend';
import { IEmailSender } from '@/core/domain/services/IEmailSender';

let client: Resend | undefined;

type ResendConfig = {
  apiKey: string;
  fromEmail: string;
};

function normalizeEnvValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function getResendConfig(): ResendConfig {
  const apiKey = normalizeEnvValue(process.env.RESEND_API_KEY);
  const fromEmail = normalizeEnvValue(process.env.RESEND_FROM_EMAIL);

  const missingVariables: string[] = [];

  if (!apiKey) {
    missingVariables.push('RESEND_API_KEY');
  }

  if (!fromEmail) {
    missingVariables.push('RESEND_FROM_EMAIL');
  }

  if (missingVariables.length > 0) {
    throw new Error(
      [
        `Missing Resend environment variables: ${missingVariables.join(', ')}.`,
        'Mission status emails use the Resend API.',
        'Set RESEND_API_KEY and RESEND_FROM_EMAIL in your server environment.',
      ].join(' ')
    );
  }

  return {
    apiKey: apiKey!,
    fromEmail: fromEmail!,
  };
}

/**
 * Get the Resend client singleton.
 * Safe to call multiple times - only constructs once.
 */
export function getResendClient(): Resend {
  if (client) {
    return client;
  }

  const { apiKey } = getResendConfig();
  client = new Resend(apiKey);

  return client;
}

export class ResendEmailSender implements IEmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    const { fromEmail } = getResendConfig();
    const resend = getResendClient();

    const { error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      throw new Error(`Resend failed to send email: ${error.message}`);
    }
  }
}
