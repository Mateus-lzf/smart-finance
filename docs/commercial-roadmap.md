# Roadmap comercial do Smart Finance

Este documento é a fonte de verdade do roadmap entre o encerramento da Sprint 16E e o primeiro
lançamento comercial do Smart Finance. O objetivo não é apenas alcançar um MVP tecnicamente
funcional, mas o menor estado comercial **profissional, seguro, operável e monetizável** que possa
receber usuários reais sem expor seus dados ou criar uma expectativa que o produto não cumpra.

## Ponto de partida

- A Sprint 16E está **ENCERRADA com PASS**.
- O piloto remoto validou Auth, isolamento A/B, Projects, Transactions, preferências, conflitos,
  importação CSV/XLSX, reimportação, atomicidade, idempotência, refresh e uso em mais de um
  navegador/dispositivo.
- Uma sessão remota usa `RemoteFinancialRepository`, não grava workspace financeiro em
  `localStorage`, não faz dual-write e não cai silenciosamente para o modo local.
- A Sprint 17 está **ENCERRADA com PASS**. Desenvolvimento e testes usam modo local explícito;
  staging resolve `remote` por ambiente para toda sessão autenticada; configuração ausente ou
  inválida falha fechada como indisponível. A antiga allowlist foi removida da decisão e do Worker.
- Não existem usuários comerciais reais ou workspaces legados que precisem ser migrados.

Por isso, a antiga Sprint 16F de migração assistida local → remoto está **aposentada e substituída**
por este roadmap. Não serão implementados detecção da chave global legada, preview de migração,
conversão de IDs ou reconciliação local/remota sem uma nova necessidade comprovada.

## Princípios obrigatórios até o lançamento

1. Um usuário comercial recém-cadastrado deve receber persistência remota segura por padrão.
2. O workspace financeiro remoto nunca usa `localStorage` como fonte de verdade.
3. Falha ou indisponibilidade remota deve produzir um estado explícito e recuperável, nunca fallback
   silencioso para dados locais.
4. Ownership deriva da sessão autenticada; RLS continua sendo a barreira final.
5. Staging e produção permanecem separados em banco, runtime, configuração, secrets e operação.
6. O modo local deve ter destino explícito como infraestrutura de desenvolvimento/testes e não como
   modo comercial acidental.
7. Nenhuma funcionalidade, integração, plano ou benefício pode ser prometido na interface antes de
   existir de verdade.

## Sprint 17 — Remote-by-default e onboarding comercial

**Status: ENCERRADA com PASS.**

### Objetivo

Remover o risco de um usuário real criar dados apenas no navegador e estabelecer uma primeira
experiência comercial coerente, remota e honesta.

### Escopo

- substituir a dependência comercial da allowlist por uma política de produção remote-by-default;
- impedir que ausência ou erro de configuração coloque um usuário comercial em modo local;
- manter comportamento fail-closed quando o remoto estiver indisponível;
- decidir e documentar o modo local como ferramenta exclusiva de desenvolvimento/testes;
- preservar uma única fonte financeira por sessão, sem dual-write ou fallback;
- implementar o fluxo cadastro → confirmação → sessão → workspace remoto vazio → primeiro uso;
- oferecer onboarding mínimo com caminhos reais para criar Project ou importar CSV/XLSX;
- revisar estados vazios, loading, indisponibilidade, retry e sessão expirada;
- corrigir mensagens que ainda presumam armazenamento financeiro local;
- remover metadata, integrações “Em breve”, placeholders e promessas de recursos inexistentes;
- definir o comportamento público de `/`;
- aplicar `noindex` básico a Auth e áreas privadas.

### Critérios de aceite

- uma conta nova em ambiente comercial resolve `remote` sem allowlist individual;
- erro de configuração ou backend indisponível não expõe nem cria workspace local;
- refresh e outro dispositivo recuperam o mesmo workspace remoto;
- nenhum workspace financeiro remoto é escrito em `localStorage`;
- onboarding permite criar ou importar os primeiros dados sem intervenção do desenvolvedor;
- as mensagens de armazenamento refletem a fonte real da sessão;
- não há promessa visível de recurso inexistente;
- modo local permanece testável, mas não é selecionável por um usuário comercial.

### Evidências de encerramento

- **Código e testes:** commits `8b01222`, `ac27be4`, `7404c70` e `b6e6e20` implementam a política
  server-authoritative por ambiente, a fronteira fail-closed, onboarding/copy/metadata honestos e
  confirmação/recuperação por `token_hash` com ação explícita e `verifyOtp` no servidor.
- **Staging operacional:** `SMART_FINANCE_ENVIRONMENT=staging` resolve toda conta autenticada como
  remota. O secret legado `SMART_FINANCE_REMOTE_PILOT_USER_IDS` foi removido do Worker e não
  participa mais da decisão financeira.
- **Aceite manual remote-by-default:** uma conta criada depois da mudança, sem allowlist, iniciou
  workspace remoto vazio, persistiu Project e Transaction após refresh, logout/login e outro
  contexto de navegador. Uma segunda conta não acessou os dados da primeira.
- **Aceite manual 17E:** cadastro iniciado em janela anônima foi confirmado em outra janela pelo
  fluxo explícito `/auth/confirmar`; recovery iniciado em um contexto foi concluído em outro; a nova
  senha autenticou normalmente; tokens de confirmação e recovery reutilizados foram rejeitados sem
  criar sessão. Não ocorreu `invalid_callback`.
- **E-mail de staging:** Mailtrap Email Sandbox está configurado como Custom SMTP somente no
  Supabase staging. Os templates `Confirm signup` e `Reset password` usam os arquivos versionados
  com `RedirectTo` + `TokenHash`. Isso é infraestrutura de teste e não substitui o SMTP de produção.

Nenhum workspace financeiro remoto é gravado em `localStorage`, não existe dual-write e falhas
remotas não acionam fallback local. Não houve migração automática de usuários ou dados locais.

## Sprint 18 — Ciclo de vida da conta e LGPD

**Status: em andamento. Checkpoints 18A e 18B concluídos; 18C e 18D concluídos localmente; 18E em
andamento; promoção e aceite da exclusão no staging permanecem na 18F.**

As decisões técnicas e de produto da 18A estão registradas em
[`docs/account-data-lifecycle.md`](account-data-lifecycle.md). Esse registro orienta a implementação,
mas não constitui parecer jurídico nem torna definitivos controlador, contatos, prazos de retenção,
Política de Privacidade ou Termos de Uso. Esses itens permanecem bloqueadores explícitos da 18E e
do encerramento da Sprint 18.

### Objetivo

Dar ao usuário controle real sobre sua conta e seus dados e publicar a base jurídica/comercial
necessária para operar o produto.

### Escopo

- exportação integral e compreensível dos dados do usuário;
- exclusão de conta e dados com confirmação, tratamento de assinatura futura e resultado verificável;
- política de retenção, descarte e tratamento de backups;
- Política de Privacidade e Termos de Uso revisados com orientação jurídica adequada;
- explicação de cookies de Auth e storages estritamente necessários;
- links legais no cadastro, login, footer e superfícies públicas adequadas;
- identificação e contato de suporte/controlador;
- procedimento para direitos do titular, correção, portabilidade e exclusão;
- registro dos fornecedores/subprocessadores relevantes;
- política para analytics futuros sem conteúdo financeiro.

Não há atualmente motivo para um banner genérico de cookies: o produto não possui tracker ou
analytics opcional comprovado. Consentimento deverá ser implementado somente se as tecnologias
adotadas futuramente e a análise jurídica exigirem.

### Critérios de aceite

- o usuário consegue exportar seus dados sem suporte manual;
- exclusão de conta remove ou agenda corretamente dados e acessos, com comportamento testado;
- retenção e recuperação não contradizem a exclusão prometida;
- Privacidade, Termos, contato e direitos do titular estão publicados e acessíveis antes do cadastro;
- cookies/storage necessários estão descritos com finalidade e duração;
- nenhum analytics opcional é ativado sem a base legal/consentimento necessário.

### Checkpoints

1. **18A — Inventário e decisões de ciclo de vida — concluído:** escopo de dados, exportação v1,
   exclusão imediata, retenção conhecida/pendente, storages, mercado, idade e fornecedores foram
   classificados sem inventar informações jurídicas.
2. **18B — Exportação integral e portabilidade — concluído com PASS:** pacote ZIP v1 com oito
   arquivos, snapshot PostgreSQL autenticado, limites técnicos, endpoint binário sem cache e painel
   de download em Configurações foram validados localmente e no staging. O aceite cobriu conta
   vazia, conta com dados e isolamento A↔B sob RLS.
3. **18C — Exclusão segura no servidor e banco — concluído localmente:** primitiva PostgreSQL
   estreita, reautenticação por senha, endpoint sem credencial administrativa e aceite adversarial
   local concluídos; promoção permanece reservada à 18F.
4. **18D — Experiência de conta e exclusão — concluído localmente:** confirmação exata `EXCLUIR`,
   senha atual, prevenção de duplo envio, erros sanitizados e recomendação de exportação foram
   validados. O painel de exportação havia sido antecipado para a 18B4. Edição cadastral continua
   pendente.
5. **18E — Privacidade, Termos, suporte e storages — em andamento:** a 18E1 corrige a coerência
   técnica do ciclo de vida e a documentação. Publicação de textos legais e suporte continua
   dependente das definições formais e da revisão jurídica registradas na 18A.
6. **18F — Promoção e aceite integral em staging — pendente.**

O checkpoint atual é a 18E. A conclusão local da exclusão não antecipa seu aceite no staging,
edição cadastral, conformidade jurídica, operação de backups, produção ou monetização.

## Sprint 19 — Confiabilidade, segurança e operação

### Objetivo

Tornar o serviço recuperável, observável, resistente a abuso e operável por uma equipe pequena.

### Escopo

- backup, retenção, RPO/RTO e restauração testada;
- observabilidade de browser, Worker, Auth, banco e operações financeiras críticas;
- logs sanitizados, alertas, correlação/identificação de incidentes e runbooks;
- quotas por usuário/plano, rate limiting e proteção contra abuso;
- limites de arquivo, payload, linhas, Projects e Transactions;
- benchmark com volumes maiores e definição do envelope suportado;
- performance, Core Web Vitals, orçamento e análise de bundle;
- acessibilidade dos fluxos críticos, teclado, foco, zoom, contraste e leitores de tela;
- suporte operacional mínimo e procedimento de incidente;
- analytics de produto sem conteúdo financeiro e com privacidade por desenho;
- baseline de headers de segurança: CSP, HSTS, proteção contra framing,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e
  `Cache-Control: private, no-store` para conteúdo autenticado/financeiro.

A CSP final não deve ser inventada antes da definição de domínio, fontes, analytics e integrações.
Ela deve ser construída, testada e endurecida sem quebrar Auth, callbacks ou Supabase.

### Critérios de aceite

- um restore drill recupera dados dentro dos objetivos documentados;
- falhas críticas geram alerta e possuem identificador pesquisável sem vazar dados financeiros;
- quotas e rate limits são aplicados no servidor;
- volumes oficialmente suportados atendem tempos e payloads definidos;
- jornadas essenciais passam na auditoria de acessibilidade;
- headers e cache são verificados nas respostas reais do runtime;
- suporte consegue receber, acompanhar e encerrar uma ocorrência.

## Sprint 20 — Produção real e Branding/Web Launch Polish

### Objetivo

Criar uma produção independente e finalizar as superfícies públicas e a identidade necessárias para
um beta fechado e, depois, abertura ampla.

### Checkpoint 20A — Fundação de produção

- projeto Supabase de produção separado de staging;
- Worker/configuração de produção independente;
- secrets próprios, rotação e menor privilégio;
- migrations, deploy, smoke tests e rollback com guardas explícitas;
- SMTP e e-mails transacionais de produção;
- domínio e callbacks definitivos;
- verificação dos cookies de Auth no domínio real;
- política correta de indexação: staging bloqueado e produção seletivamente indexável;
- beta fechado com usuários reais antes da abertura ampla.

### Checkpoint 20B — Identidade e domínio

Antes de produzir assets definitivos, decidir:

- nome definitivo e disponibilidade jurídica/digital;
- domínio;
- logo e símbolo reduzido;
- paleta;
- tipografia;
- regras mínimas de identidade.

Nome, ícone, paleta e favicon atuais não são branding definitivo.

### Checkpoint 20C — Web Launch Polish

Depois da identidade definida:

- favicon definitivo, Apple Touch Icon e demais ícones realmente necessários;
- imagem Open Graph, metadata definitiva e canonical URLs;
- `robots.txt` de produção e sitemap somente se houver conteúdo público suficiente;
- landing page pública e footer;
- páginas 404/500 finais em português;
- links legais e de suporte;
- fontes self-hosted se essa for a decisão final;
- otimização de imagens/assets quando eles existirem;
- Lighthouse/Core Web Vitals;
- testes Chrome, Edge, Firefox e Safari;
- validação mobile de Auth, upload, download, CSV, impressão/PDF e navegação;
- revisão final de acessibilidade, performance e headers.

PWA completa, Service Worker e modo offline não são requisitos deste lançamento.

### Critérios de aceite

- produção não compartilha banco, secrets ou runtime com staging;
- deploy e rollback de produção foram ensaiados;
- Auth, recuperação e e-mails funcionam no domínio real;
- branding e superfícies públicas não contêm elementos provisórios;
- staging permanece não indexável e somente páginas públicas aprovadas podem ser indexadas em
  produção;
- beta fechado conclui o roteiro sem bloqueador P0 conhecido;
- navegadores, mobile, acessibilidade, performance e segurança web possuem evidência registrada.

## Sprint 21 — Monetização e lançamento comercial

### Objetivo

Definir e operar o modelo comercial, sem acoplar o domínio do produto prematuramente a um provedor
de pagamentos.

### Escopo

- definição de plano/período gratuito;
- planos pagos e preços;
- trial, se escolhido;
- assinatura e entitlement server-side;
- limites por plano;
- upgrade, downgrade, cancelamento e grace period;
- estados de pagamento e reconciliação idempotente;
- página pública de preços;
- políticas de cobrança e reembolso;
- suporte relacionado à cobrança;
- analytics de conversão respeitando privacidade;
- consentimento somente se as ferramentas opcionais escolhidas exigirem;
- checklist e decisão final de abertura comercial.

O provedor de pagamento e os preços não são definidos por este roadmap.

### Critérios de aceite

- acesso e limites são derivados de entitlement confiável, não de estado manipulável no browser;
- webhooks/reconciliação não geram cobrança ou concessão duplicada;
- estados de trial, ativo, inadimplente, cancelado e expirado têm comportamento definido;
- usuário consegue compreender preço, alterar/cancelar o plano e obter suporte;
- cobrança, políticas e experiência foram testadas antes de aceitar pagamento real;
- se o lançamento inicial for gratuito, itens de cobrança ficam explicitamente fora da abertura e
  nenhuma assinatura paga é anunciada.

## Checklist “pronto para lançamento comercial”

O projeto só pode receber essa declaração quando todos os itens aplicáveis estiverem comprovados:

- [ ] usuários comerciais novos são remotos por padrão;
- [ ] não existe fallback silencioso para armazenamento local;
- [ ] isolamento entre usuários e ownership estão validados em produção;
- [ ] Auth, confirmação, sessão, logout e recuperação funcionam no domínio de produção;
- [ ] backup e restauração foram testados;
- [ ] exportação e exclusão de conta/dados funcionam;
- [ ] Privacidade, Termos, retenção, cookies/storage e direitos LGPD estão publicados;
- [ ] produção é separada de staging;
- [ ] domínio, SMTP e e-mails transacionais estão configurados;
- [ ] headers, CSP, cookies, cache e demais controles web foram validados;
- [ ] observabilidade, alertas, suporte e runbooks existem;
- [ ] quotas, limites e proteção contra abuso estão ativos;
- [ ] onboarding funciona sem intervenção do desenvolvedor;
- [ ] performance, Core Web Vitals, acessibilidade, mobile e navegadores principais foram validados;
- [ ] não existem mocks, placeholders, integrações ou promessas falsas visíveis;
- [ ] branding, landing, metadata, favicon, 404/500, footer e links públicos estão finalizados;
- [ ] modelo gratuito/pago e cobrança funcionam, caso a abertura já envolva pagamento;
- [ ] beta fechado não revelou bloqueadores P0 conhecidos;
- [ ] checklist operacional de lançamento e rollback foi aprovado.

## Fora do primeiro lançamento

Salvo nova justificativa baseada em necessidade real, não são requisitos:

- PWA completa, Service Worker, modo offline e push notifications;
- blog ou CMS;
- SEO das áreas privadas;
- schema.org complexo;
- internacionalização completa;
- banner de cookies sem trackers opcionais;
- otimização de imagens que ainda não existem;
- sincronização bancária, IA generativa, colaboração ou aplicativo mobile nativo.

## Ordem oficial

1. Sprint 17 — Remote-by-default e onboarding comercial — **encerrada com PASS**;
2. Sprint 18 — Ciclo de vida da conta e LGPD;
3. Sprint 19 — Confiabilidade, segurança e operação;
4. Sprint 20 — Produção real e Branding/Web Launch Polish;
5. Sprint 21 — Monetização e lançamento comercial.

A próxima implementação é a Sprint 18 — Ciclo de vida da conta e LGPD. Produção, domínio e SMTP
transacional definitivo permanecem na Sprint 20; o Mailtrap atual atende somente ao staging.
