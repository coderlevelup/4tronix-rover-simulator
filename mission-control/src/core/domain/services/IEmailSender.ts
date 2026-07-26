/**
 * Email Sender Interface
 *
 * Domain layer defines the contract; infrastructure layer provides the
 * concrete implementation (Resend). Mirrors the IMissionRepository pattern
 * so notification logic can be unit tested with a mock sender.
 */

export interface IEmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}
