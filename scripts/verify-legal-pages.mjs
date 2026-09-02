import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");

const [privacy, terms, legalPage, authPage, signup, login, settings, root, packageJson] =
  await Promise.all([
    read("src/routes/privacidade.tsx"),
    read("src/routes/termos.tsx"),
    read("src/components/legal-page.tsx"),
    read("src/components/auth/auth-page.tsx"),
    read("src/routes/cadastro.tsx"),
    read("src/routes/login.tsx"),
    read("src/routes/_authenticated/configuracoes.tsx"),
    read("src/routes/__root.tsx"),
    read("package.json"),
  ]);

assert.match(privacy, /createFileRoute\(["']\/privacidade["']\)/);
assert.match(terms, /createFileRoute\(["']\/termos["']\)/);
for (const route of [privacy, terms]) {
  assert.doesNotMatch(route, /beforeLoad|getAuthState|redirect\(/);
  assert.match(route, /name:\s*["']description["']/);
  assert.match(route, /productTitle\(/);
}
assert.notEqual(
  privacy.match(/productTitle\(["']([^"']+)/)?.[1],
  terms.match(/productTitle\(["']([^"']+)/)?.[1],
);
assert.notEqual(
  privacy.match(/content:\s*["']([^"']+)/)?.[1],
  terms.match(/content:\s*["']([^"']+)/)?.[1],
);

assert.match(legalPage, /aria-label=["']Documentos e acesso["']/);
assert.match(legalPage, /aria-label=["']Links legais["']/);
assert.match(legalPage, /flex-wrap/);
assert.match(legalPage, /to=["']\/login["']/);
assert.match(authPage, /<LegalLinks \/>/);
assert.match(signup, /to=["']\/privacidade["']/);
assert.match(signup, /to=["']\/termos["']/);
assert.match(login, /<AuthPage/);
assert.match(settings, /<Panel title=["']Informações legais["']/);
assert.match(settings, /to=["']\/privacidade["']/);
assert.match(settings, /to=["']\/termos["']/);
assert.match(settings, /AccountDataExport/);
assert.match(settings, /AccountDeletion/);

const publicCopy = `${privacy}\n${terms}\n${legalPage}\n${signup}`;
assert.doesNotMatch(publicCopy, /\[(?:CONTROLADOR|CNPJ|EMAIL|SUPORTE|DPO)\]|TODO|example\.com/i);
assert.doesNotMatch(publicCopy, /type=["']checkbox["']|accepted_at|legal_acceptance/i);
assert.doesNotMatch(publicCopy, /cookie banner|banner de cookies/i);
assert.match(privacy, /Não há, nesta versão, ferramenta opcional de publicidade/);
assert.match(privacy, /não significa eliminação imediata de eventuais cópias de\s+segurança/);
assert.match(terms, /não há plano pago, assinatura ou cobrança/);
assert.match(root, /noindex, nofollow/);
assert.match(packageJson, /verify-legal-pages\.mjs/);

console.log("Public legal pages, navigation and honest development copy passed.");
