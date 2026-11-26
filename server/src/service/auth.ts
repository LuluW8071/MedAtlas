import { promisify } from 'node:util';
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import type { RequestHandler } from 'express';

import { authCredentialsSchema } from '../schemas/api.js';
import { getDb } from './clients/mongo_client.js';

interface UserDoc { _id: string; email: string; passwordHash: string; createdAt: number }
interface SessionDoc { _id: string; userId: string; expiresAt: Date }

const users = () => getDb().collection<UserDoc>('users');
const sessions = () => getDb().collection<SessionDoc>('sessions');
const threadOwners = () => getDb().collection<{ _id: string; userId: string }>('thread_owners');

let indexesReady: Promise<unknown> | undefined;

/** Unique emails and self-expiring sessions; created once per process. */
function ensureIndexes() {
  indexesReady ??= Promise.all([
    users().createIndex({ email: 1 }, { unique: true }),
    sessions().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return indexesReady;
}

const scrypt = promisify(scryptCallback);
const sessionCookie = 'medatlas_session';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const cookieSameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';
const cookieSecure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

function setSessionCookie(response: Parameters<RequestHandler>[1], token: string) {
  response.setHeader('Set-Cookie', `${sessionCookie}=${token}; HttpOnly; Path=/; SameSite=${cookieSameSite}; Max-Age=${sessionLifetimeMs / 1000}${cookieSecure}`);
}

function clearSessionCookie(response: Parameters<RequestHandler>[1]) {
  response.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; Path=/; SameSite=${cookieSameSite}; Max-Age=0${cookieSecure}`);
}

function requestSessionToken(request: Parameters<RequestHandler>[0]) {
  const cookieHeader = request.headers.cookie;
  const cookie = cookieHeader?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`));
  return cookie?.slice(sessionCookie.length + 1);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

async function passwordMatches(password: string, stored: string) {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createSession(userId: string, response: Parameters<RequestHandler>[1]) {
  const token = randomBytes(32).toString('base64url');
  await ensureIndexes();
  await sessions().insertOne({ _id: hashToken(token), userId, expiresAt: new Date(Date.now() + sessionLifetimeMs) });
  setSessionCookie(response, token);
}

export const signUpRoute: RequestHandler = async (request, response) => {
  const parsed = authCredentialsSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials' });
    return;
  }

  const { email, password } = parsed.data;
  try {
    const id = randomUUID();
    await ensureIndexes();
    await users().insertOne({ _id: id, email, passwordHash: await hashPassword(password), createdAt: Date.now() });
    await createSession(id, response);
    response.status(201).json({ user: { id, email } });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      response.status(409).json({ error: 'An account with this email already exists' });
      return;
    }
    response.status(500).json({ error: 'Could not create account' });
  }
};

export const loginRoute: RequestHandler = async (request, response) => {
  const parsed = authCredentialsSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials' });
    return;
  }

  try {
    const user = await users().findOne({ email: parsed.data.email });
    if (!user || !(await passwordMatches(parsed.data.password, user.passwordHash))) {
      response.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    await createSession(user._id, response);
    response.json({ user: { id: user._id, email: user.email } });
  } catch {
    response.status(500).json({ error: 'Could not log in' });
  }
};

export const logoutRoute: RequestHandler = async (request, response) => {
  const token = requestSessionToken(request);
  try {
    if (token) await sessions().deleteOne({ _id: hashToken(token) });
    clearSessionCookie(response);
    response.status(204).end();
  } catch {
    response.status(500).json({ error: 'Could not log out' });
  }
};

export const currentUserRoute: RequestHandler = async (_request, response) => {
  const userId = response.locals.userId as string;
  try {
    const user = await users().findOne({ _id: userId });
    response.json({ user: user && { id: user._id, email: user.email } });
  } catch {
    response.status(500).json({ error: 'Could not load account' });
  }
};

export const requireAuth: RequestHandler = async (request, response, next) => {
  const token = requestSessionToken(request);
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const session = await sessions().findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!session) {
      clearSessionCookie(response);
      response.status(401).json({ error: 'Authentication required' });
      return;
    }
    response.locals.userId = session.userId;
    next();
  } catch {
    response.status(500).json({ error: 'Could not verify session' });
  }
};

export async function claimConversation(userId: string, threadId: string) {
  await threadOwners().updateOne({ _id: threadId }, { $setOnInsert: { userId } }, { upsert: true });
  return (await threadOwners().findOne({ _id: threadId }))?.userId === userId;
}
