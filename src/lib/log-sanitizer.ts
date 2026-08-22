const SENSITIVE_QUERY_VALUE =
  /([?&](?:code|token|access_token|refresh_token|token_hash)=)[^&#\s]+/gi;
const AUTHORIZATION_VALUE = /(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi;
const COOKIE_VALUE = /((?:set-cookie|cookie)\s*[:=]\s*)[^\r\n]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function sanitizeLogText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_VALUE, "$1[REDACTED]")
    .replace(AUTHORIZATION_VALUE, "$1[REDACTED]")
    .replace(COOKIE_VALUE, "$1[REDACTED]")
    .replace(JWT_VALUE, "[REDACTED_JWT]")
    .replace(EMAIL_VALUE, "[REDACTED_EMAIL]");
}
