import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");

const [
  root,
  authenticatedIndex,
  authenticatedLayout,
  dashboard,
  projectEmptyState,
  settings,
  appShell,
  navigation,
  authUnavailable,
  financialUnavailable,
  dataRoute,
  insightsRoute,
  reportsRoute,
  projectsRoute,
] = await Promise.all([
  read("src/routes/__root.tsx"),
  read("src/routes/_authenticated/index.tsx"),
  read("src/routes/_authenticated.tsx"),
  read("src/routes/_authenticated/dashboard.tsx"),
  read("src/components/app/project-empty-state.tsx"),
  read("src/routes/_authenticated/configuracoes.tsx"),
  read("src/components/app/app-shell.tsx"),
  read("src/lib/app-navigation.ts"),
  read("src/routes/auth-indisponivel.tsx"),
  read("src/components/app/financial-configuration-unavailable.tsx"),
  read("src/routes/_authenticated/dados.tsx"),
  read("src/routes/_authenticated/insights.tsx"),
  read("src/routes/_authenticated/relatorios.tsx"),
  read("src/routes/_authenticated/projetos.tsx"),
]);

assert.match(authenticatedIndex, /redirect\(\{ to: ["']\/dashboard["'], replace: true \}\)/);
assert.match(authenticatedLayout, /redirect:\s*sanitizeInternalRedirect\(location\.href/);

assert.match(projectEmptyState, /Você ainda não possui projetos/);
assert.match(projectEmptyState, /to=["']\/criar["']/);
assert.match(projectEmptyState, /Criar projeto/);
assert.match(projectEmptyState, /to=["']\/importar["']/);
assert.match(projectEmptyState, /Importar planilha/);
assert.doesNotMatch(projectEmptyState, /\bIA\b|inteligência|integraç|automação/i);

assert.match(dashboard, /Este projeto ainda não possui lançamentos/);
assert.match(dashboard, /to=["']\/importar["']/);
assert.match(dashboard, /Novo lançamento/);
assert.match(dashboard, /financialStatus === "ready"|<ProjectEmptyState/);

const removedPromises = /Em breve|Open Finance|NF-e|Google Sheets|WhatsApp|plano e integrações/i;
assert.doesNotMatch(settings, removedPromises);
assert.doesNotMatch(settings, /<Panel title=["']Integrações["']/);
assert.match(settings, /<Panel title=["']Conta["']/);
assert.match(settings, /<Panel title=["']Armazenamento["']/);
assert.match(settings, /<Panel title=["']Tema["']/);
assert.match(settings, /financialMode === "remote"/);
assert.match(settings, /Dados sincronizados com sua conta/);
assert.match(appShell, /financialMode === "remote"/);
assert.doesNotMatch(`${appShell}\n${navigation}`, /AiDock|AiConversation/);

assert.match(authUnavailable, /Não conseguimos verificar sua conta neste momento/);
assert.doesNotMatch(authUnavailable, /sessão continua ativa/);
assert.match(financialUnavailable, /Sua sessão continua ativa/);
assert.doesNotMatch(financialUnavailable, /neste dispositivo|localStorage|Supabase|repository/i);

assert.match(root, /name: ["']robots["'], content: ["']noindex, nofollow["']/);
assert.match(root, /Sprint 20 must revisit indexing/);
assert.doesNotMatch(root, /og:title|og:description|og:type|twitter:card/);

for (const source of [dashboard, dataRoute, insightsRoute, reportsRoute, projectsRoute, settings]) {
  assert.match(source, /name: ["']description["']/);
  assert.doesNotMatch(source, /og:title|og:description|og:type|twitter:card/);
}

console.log("Onboarding real, copy honesta e metadata privada sem indexação: OK");
