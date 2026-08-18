const ALLOWED_PATHS = new Set([
  "/",
  "/cadastro",
  "/configuracoes",
  "/criar",
  "/dados",
  "/dashboard",
  "/esqueci-senha",
  "/importar",
  "/insights",
  "/login",
  "/projetos",
  "/redefinir-senha",
  "/relatorios",
]);

export function sanitizeInternalRedirect(
  candidate: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  const hasControlCharacter = [...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (candidate.includes("\\") || hasControlCharacter) return fallback;

  try {
    const parsed = new URL(candidate, "https://smart-finance.invalid");
    if (parsed.origin !== "https://smart-finance.invalid") return fallback;
    if (!ALLOWED_PATHS.has(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
