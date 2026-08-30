import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { sanitizeInternalRedirect } = await vite.ssrLoadModule("/src/lib/auth/safe-redirect.ts");
  assert.equal(sanitizeInternalRedirect(undefined), "/dashboard");
  assert.equal(sanitizeInternalRedirect("/"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("/?utm_source=auth-email"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("/dados?pagina=2"), "/dados?pagina=2");
  assert.equal(sanitizeInternalRedirect("https://evil.example/dashboard"), "/dashboard");
  assert.equal(sanitizeInternalRedirect("//evil.example/dashboard"), "/dashboard");

  const [
    indexRoute,
    dashboardRoute,
    authenticatedLayout,
    loginRoute,
    callbackRoute,
    confirmationRoute,
    authFunctions,
  ] = await Promise.all([
    readFile("src/routes/_authenticated/index.tsx", "utf8"),
    readFile("src/routes/_authenticated/dashboard.tsx", "utf8"),
    readFile("src/routes/_authenticated.tsx", "utf8"),
    readFile("src/routes/login.tsx", "utf8"),
    readFile("src/routes/auth/callback.tsx", "utf8"),
    readFile("src/routes/auth/confirmar.tsx", "utf8"),
    readFile("src/lib/auth/auth-functions.ts", "utf8"),
  ]);

  assert.match(indexRoute, /redirect\(\{ to: ["']\/dashboard["'], replace: true \}\)/);
  assert.doesNotMatch(indexRoute, /ProjectEmptyState|useApp|min-h-screen/);
  assert.match(dashboardRoute, /<AppShell/);
  assert.match(dashboardRoute, /<ProjectEmptyState/);
  assert.match(authenticatedLayout, /redirect:\s*sanitizeInternalRedirect\(location\.href/);
  assert.match(
    loginRoute,
    /window\.location\.assign\(sanitizeInternalRedirect\(search\.redirect\)\)/,
  );
  assert.match(loginRoute, /status === ["']authenticated["']/);
  assert.match(callbackRoute, /sanitizeInternalRedirect\(search\.next\)/);
  assert.doesNotMatch(confirmationRoute, /beforeLoad[\s\S]*verifyEmailToken/);
  assert.match(confirmationRoute, /onSubmit=\{handleConfirmation\}/);
  assert.match(confirmationRoute, /window\.location\.hash/);
  assert.match(confirmationRoute, /window\.history\.replaceState/);
  assert.match(confirmationRoute, /sanitizeInternalRedirect\(search\.next/);
  assert.match(authFunctions, /emailActionUrl\(data\.next \?\? ["']\/dashboard["']\)/);
  assert.match(authFunctions, /emailActionUrl\(["']\/redefinir-senha["']\)/);
  assert.match(authFunctions, /auth\.verifyOtp/);

  console.log("Navegação Auth canônica, raiz e redirects seguros: OK");
  console.log("Estado vazio existe no Dashboard autenticado com AppShell: OK");
} finally {
  await vite.close();
}
