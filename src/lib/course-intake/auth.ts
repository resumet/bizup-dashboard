import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COURSE_INTAKE_COOKIE = "bizup_course_intake_session";
export const COURSE_INTAKE_SESSION_SECONDS = 60 * 60 * 8;

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function secureStringEqual(actual: string, expected: string) {
  return timingSafeEqual(digest(actual), digest(expected));
}

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(expiresAt, "utf8").digest("hex");
}

export function createCourseIntakeToken(
  secret: string,
  now = Date.now(),
  lifetimeSeconds = COURSE_INTAKE_SESSION_SECONDS,
) {
  const expiresAt = String(Math.floor(now / 1_000) + lifetimeSeconds);
  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function verifyCourseIntakeToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (!token || !secret) return false;
  const [expiresAt, suppliedSignature, extra] = token.split(".");
  if (!expiresAt || !suppliedSignature || extra) return false;
  const expiresAtSeconds = Number(expiresAt);
  if (!Number.isSafeInteger(expiresAtSeconds)) return false;
  if (expiresAtSeconds <= Math.floor(now / 1_000)) return false;
  return secureStringEqual(suppliedSignature, signature(expiresAt, secret));
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
