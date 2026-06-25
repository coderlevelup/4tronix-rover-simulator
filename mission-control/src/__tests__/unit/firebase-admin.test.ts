describe('initializeFirebaseAdmin', () => {
  const originalEnv = process.env;

  async function importFirebaseAdmin() {
    return import('@/infrastructure/persistence/firebase-admin');
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to REACT_APP_FIREBASE_PROJECT_ID when FIREBASE_PROJECT_ID is unset', async () => {
    const cert = jest.fn((config) => config);
    const initializeApp = jest.fn(() => ({ name: 'test-app' }));

    process.env.REACT_APP_FIREBASE_PROJECT_ID = 'legacy-project-id';
    process.env.FIREBASE_CLIENT_EMAIL = 'test@test.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = 'private-key';

    jest.doMock('firebase-admin/app', () => ({
      cert,
      getApps: jest.fn(() => []),
      initializeApp,
    }));

    jest.doMock('firebase-admin/firestore', () => ({
      getFirestore: jest.fn(),
    }));

    const { initializeFirebaseAdmin } = await importFirebaseAdmin();

    initializeFirebaseAdmin();

    expect(cert).toHaveBeenCalledWith({
      projectId: 'legacy-project-id',
      clientEmail: 'test@test.iam.gserviceaccount.com',
      privateKey: 'private-key',
    });
    expect(initializeApp).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace and surrounding quotes from Firebase Admin env values', async () => {
    const cert = jest.fn((config) => config);
    const initializeApp = jest.fn(() => ({ name: 'test-app' }));

    process.env.FIREBASE_PROJECT_ID = ' "quoted-project" ';
    process.env.FIREBASE_CLIENT_EMAIL = ' "test@test.iam.gserviceaccount.com" ';
    process.env.FIREBASE_PRIVATE_KEY = ' "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" ';

    jest.doMock('firebase-admin/app', () => ({
      cert,
      getApps: jest.fn(() => []),
      initializeApp,
    }));

    jest.doMock('firebase-admin/firestore', () => ({
      getFirestore: jest.fn(),
    }));

    const { initializeFirebaseAdmin } = await importFirebaseAdmin();

    initializeFirebaseAdmin();

    expect(cert).toHaveBeenCalledWith({
      projectId: 'quoted-project',
      clientEmail: 'test@test.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });
  });

  it('throws a clear error when Firebase Admin credentials are missing', async () => {
    jest.doMock('firebase-admin/app', () => ({
      cert: jest.fn(),
      getApps: jest.fn(() => []),
      initializeApp: jest.fn(),
    }));

    jest.doMock('firebase-admin/firestore', () => ({
      getFirestore: jest.fn(),
    }));

    const { initializeFirebaseAdmin } = await importFirebaseAdmin();

    expect(() => initializeFirebaseAdmin()).toThrow(
      'Missing Firebase Admin environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.'
    );
    expect(() => initializeFirebaseAdmin()).toThrow(
      'Client-side Firebase config such as NEXT_PUBLIC_FIREBASE_* or REACT_APP_FIREBASE_* is not enough on its own.'
    );
  });
});
