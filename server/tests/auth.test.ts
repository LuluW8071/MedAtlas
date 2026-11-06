import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

// Throwaway database; needs the local Mongo from docker compose.
process.env.MONGODB_DB_NAME = `medatlas_test_${randomUUID().slice(0, 8)}`;

after(async () => {
  const { getDb, mongoClient } = await import('../src/service/clients/mongo_client.js');
  await getDb().dropDatabase();
  await mongoClient.close();
});

function mockResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader(name: string, value: string) { headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end() { return this; },
  };
}

test('signup stores scrypt hash and login session resolves account ID', async () => {
  const [{ getDb }, { claimConversation, currentUserRoute, loginRoute, requireAuth, signUpRoute }] = await Promise.all([
    import('../src/service/clients/mongo_client.js'),
    import('../src/service/auth.js'),
  ]);
  const password = 'private-password-123';
  const signupResponse = mockResponse();
  await signUpRoute({ body: { email: 'TEST@example.com', password }, headers: {} } as never, signupResponse as never, (() => {}) as never);

  assert.equal(signupResponse.statusCode, 201);
  const storedUser = await getDb().collection<{ _id: string; email: string; passwordHash: string }>('users').findOne({});
  assert.ok(storedUser);
  assert.match(storedUser.passwordHash, /^scrypt:/);
  assert.ok(!storedUser.passwordHash.includes(password));
  assert.equal(storedUser.email, 'test@example.com');

  const loginResponse = mockResponse();
  await loginRoute({ body: { email: 'test@example.com', password }, headers: {} } as never, loginResponse as never, (() => {}) as never);
  assert.equal(loginResponse.statusCode, 200);
  const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];
  const authResponse = mockResponse();
  let passed = false;
  await requireAuth({ headers: { cookie } } as never, authResponse as never, (() => { passed = true; }) as never);
  assert.equal(passed, true);
  await currentUserRoute({} as never, authResponse as never, (() => {}) as never);
  assert.deepEqual(authResponse.body, { user: { id: storedUser._id, email: storedUser.email } });

  const duplicate = mockResponse();
  await signUpRoute({ body: { email: 'test@example.com', password }, headers: {} } as never, duplicate as never, (() => {}) as never);
  assert.equal(duplicate.statusCode, 409);

  assert.equal(await claimConversation(storedUser._id, 'thread-1'), true);
  assert.equal(await claimConversation('someone-else', 'thread-1'), false);
});
