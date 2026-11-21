import "server-only";

import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";
import pool from "@/lib/db";
import type { AuthUser, UserRole } from "@/lib/authorization";
import { resolveSessionSecret } from "@/lib/session-secret";

export { requireRole } from "@/lib/authorization";
export type { AuthUser, UserRole } from "@/lib/authorization";

const scrypt = promisify(scryptCallback);

type SessionPayload = AuthUser & { exp: number };

export const SESSION_COOKIE = "campusconnect_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function sessionSecret(): string | null {
  return resolveSessionSecret(
    process.env.AUTH_SESSION_SECRET,
    process.env.NODE_ENV
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const [algorithm, salt, storedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !storedHex) {
    return false;
  }
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHex, "hex");
  return stored.length === derived.length &&
    timingSafeEqual(stored, derived);
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(user: AuthUser): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is missing or invalid.");
  }

  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readSessionToken(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const secret = sessionSecret();
  if (!secret) return null;

  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expectedSignature = sign(encoded, secret);

  try {
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<SessionPayload>;

    if (
      typeof payload.userId !== "number" ||
      typeof payload.username !== "string" ||
      (payload.role !== "Student" &&
        payload.role !== "CompanyRep" &&
        payload.role !== "Admin") ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function getSessionUser(request: Request): AuthUser | null {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;

  let token: string;
  try {
    token = decodeURIComponent(match.slice(match.indexOf("=") + 1));
  } catch {
    return null;
  }

  return readSessionToken(token);
}

export async function findUserByUsername(username: string) {
  const result = await pool.query(
    `SELECT user_id, username, password_hash, role
     FROM users
     WHERE username = $1`,
    [username]
  );
  return result.rows[0] as
    | {
        user_id: number;
        username: string;
        password_hash: string;
        role: UserRole;
      }
    | undefined;
}
