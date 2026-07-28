/**
 * ResendEmailSender - sandbox recipient redirect.
 *
 * While RESEND_FROM_EMAIL is onboarding@resend.dev, Resend only accepts the
 * address that owns the API key, so the redirect is what makes an end-to-end
 * send demonstrable at all. These tests pin that behaviour, and pin that it
 * disappears cleanly once RESEND_SANDBOX_RECIPIENT is unset for a real domain.
 */

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const ORIGINAL_ENV = process.env;

async function loadSender() {
  // The module memoises its Resend client, so each case needs a fresh copy.
  jest.resetModules();
  const imported = await import('@/infrastructure/email/resend-client');
  return imported.ResendEmailSender;
}

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  process.env = {
    ...ORIGINAL_ENV,
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'onboarding@resend.dev',
  };
  delete process.env.RESEND_SANDBOX_RECIPIENT;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('ResendEmailSender', () => {
  it('redirects to the sandbox inbox and keeps the intended recipient visible', async () => {
    process.env.RESEND_SANDBOX_RECIPIENT = 'konke@example.com';
    const ResendEmailSender = await loadSender();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await new ResendEmailSender().send(
      'learner@school.edu',
      '🛰️ Mission Queued - Red Rock Run',
      '<p>hi</p>'
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('konke@example.com');
    expect(payload.subject).toBe('[to: learner@school.edu] 🛰️ Mission Queued - Red Rock Run');
    expect(payload.html).toBe('<p>hi</p>');

    // The redirect must be loud: the service layer logs the intended recipient,
    // so without this the logs would claim a learner was mailed when they weren't.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('learner@school.edu -> konke@example.com')
    );
    warnSpy.mockRestore();
  });

  it('sends to the real recipient untouched when no sandbox recipient is set', async () => {
    const ResendEmailSender = await loadSender();

    await new ResendEmailSender().send('learner@school.edu', 'Mission Queued', '<p>hi</p>');

    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe('learner@school.edu');
    expect(payload.subject).toBe('Mission Queued');
  });

  it('throws when Resend rejects the send', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'You can only send testing emails to your own email address' },
    });
    const ResendEmailSender = await loadSender();

    await expect(
      new ResendEmailSender().send('learner@school.edu', 'Mission Queued', '<p>hi</p>')
    ).rejects.toThrow('You can only send testing emails to your own email address');
  });

  it('names every missing variable when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    const ResendEmailSender = await loadSender();

    await expect(
      new ResendEmailSender().send('learner@school.edu', 'Mission Queued', '<p>hi</p>')
    ).rejects.toThrow('RESEND_API_KEY, RESEND_FROM_EMAIL');
  });
});
