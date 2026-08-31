# Ciclo de vida dos dados da conta

Este documento registra as decisões técnicas e de produto aprovadas no Checkpoint 18A do Smart
Finance. Ele orienta a implementação dos checkpoints seguintes, mas **não constitui Política de
Privacidade, Termos de Uso, parecer jurídico ou declaração definitiva de conformidade com a LGPD**.
Informações identificadas como pendentes não podem ser inventadas nem publicadas como definitivas
antes de decisão do responsável pelo produto e revisão competente.

## Status e fronteira

- Sprint 17: encerrada com PASS.
- Sprint 18: aberta.
- Checkpoint 18A: decisões aprovadas e documentadas.
- Checkpoint 18B: exportação integral e portabilidade concluída com PASS local e no staging.
- Próximo checkpoint: 18C, exclusão segura no servidor e banco.
- Correção cadastral e exclusão de conta ainda não foram implementadas.
- A 18B adicionou e promoveu somente a infraestrutura de exportação descrita neste documento; não
  alterou as policies RLS existentes nem antecipou exclusão, textos jurídicos ou produção.

## Classificação das decisões

### Decisões técnicas e de produto aprovadas

- mercado inicial no Brasil, em português e com valores em BRL;
- uso inicial restrito a maiores de 18 anos;
- dados permanecem no banco ativo enquanto a conta estiver ativa;
- exclusão imediata e irreversível dos dados ativos, após reautenticação e confirmação forte;
- recomendação de exportação antes da exclusão;
- exportação em ZIP versionado cuja composição de JSONs e CSVs legíveis forma o pacote integral;
- nome editável no produto e alteração de e-mail inicialmente mediada por suporte;
- Supabase e Cloudflare classificados preliminarmente como serviços operacionais essenciais;
- Mailtrap restrito a testes no staging;
- Google Fonts permanece externo até a reavaliação prevista para a Sprint 20;
- ausência atual de tracker ou analytics opcional, sem justificativa técnica para banner genérico de
  cookies neste estágio.

### Informações provisórias

- o território de referência informado é Brasil, Ceará;
- Google Fonts continuará externo até a decisão de self-hosting da Sprint 20;
- a mudança de e-mail dependerá inicialmente de suporte, sem fluxo self-service nesta Sprint;
- Mailtrap atende somente ao staging e não é o SMTP transacional futuro;
- a estrutura interna do pacote de exportação começa na versão 1 e poderá evoluir com versionamento.

### Questões jurídicas e operacionais pendentes

- identificação formal do controlador;
- nome legal, endereço e CNPJ, se aplicável;
- canal definitivo de suporte e canal LGPD;
- prazo interno de atendimento;
- encarregado ou DPO, se aplicável;
- bases legais detalhadas por finalidade;
- foro e redação final das responsabilidades;
- prazos de retenção de backups, logs e solicitações de suporte/LGPD;
- tratamento jurídico de transferências internacionais;
- revisão da classificação e divulgação pública dos subprocessadores;
- revisão e aprovação jurídica da Política de Privacidade e dos Termos de Uso.

Essas pendências não bloqueiam a implementação técnica da exportação. Elas bloqueiam o encerramento
do Checkpoint 18E e da Sprint 18.

## Inventário atual de dados

| Categoria                                | Fonte atual                           | Finalidade técnica atual                        | Exportação                 | Exclusão ativa               |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------- | -------------------------- | ---------------------------- |
| Identidade, e-mail e timestamps de Auth  | `auth.users`                          | cadastro, autenticação e sessão                 | campos não secretos        | exclusão da conta            |
| Nome e locale                            | `user_profiles`                       | identificação básica e locale                   | sim                        | cascade da conta             |
| Projetos                                 | `projects`                            | organização do workspace                        | sim                        | cascade da conta             |
| Lançamentos                              | `transactions`                        | gestão e análise financeira                     | sim                        | cascade de Project/conta     |
| Perfis de importação                     | `import_profiles`                     | preservar mapeamentos de planilha               | sim                        | cascade de Project/conta     |
| Histórico de importações                 | `import_runs`                         | atomicidade, idempotência e auditoria funcional | sim                        | cascade de Project/conta     |
| Preferências financeiras                 | `project_preferences`                 | colunas e dimensões analíticas                  | sim                        | cascade de Project/conta     |
| Projeto ativo por dispositivo            | `localStorage` namespaced por usuário | continuidade da navegação local                 | descrito; não autoritativo | remover no dispositivo atual |
| Tema                                     | `smart-finance.theme`                 | aparência do dispositivo                        | descrito; não financeiro   | pode permanecer              |
| Workspace local de desenvolvimento/teste | `localStorage` namespaced             | execução explícita do modo local                | fora da conta remota       | não apagar globalmente       |
| Chave local legada global                | `localStorage`                        | legado não atribuído                            | não usar automaticamente   | não apagar cegamente         |
| Cookies de Auth                          | Supabase SSR/Auth                     | manter e renovar sessão                         | nunca exportar tokens      | invalidar/remover            |

Tokens, senhas, hashes, cookies, secrets, credenciais administrativas e material de sessão nunca
fazem parte da portabilidade.

## Contrato implementado da exportação v1

A exportação é um arquivo ZIP gerado sob demanda, mantido apenas em memória durante a resposta e
não armazenado permanentemente pelo servidor ou pelo produto. A estrutura implementada é:

```text
smart-finance-export-v1-AAAA-MM-DD.zip
├── README.txt
├── manifest.json
├── account.json
├── projects.csv
├── transactions.csv
├── import-profiles.json
├── import-runs.csv
└── project-preferences.json
```

O contrato v1 implementado preserva estas decisões:

- `manifest.json` identifica a versão do formato e o momento da geração;
- `account.json` contém somente dados de identidade portáveis e não secretos;
- `transactions.csv` é único e inclui `project_id`;
- `projects.csv` permite relacionar IDs e nomes;
- datas financeiras permanecem `YYYY-MM-DD`, sem conversão por timezone;
- timestamps usam representação ISO 8601;
- valores monetários não são abreviados nem arredondados silenciosamente;
- `additionalData` preserva seus tipos escalares no formato integral;
- Projects, Transactions, profiles, runs, preferences, metadados e versões pertencentes ao usuário
  autenticado devem estar presentes;
- nenhum `user_id` enviado pelo browser será aceito como autoridade;
- a exportação será protegida pela sessão real e por RLS;
- respostas e arquivos financeiros não podem ser incluídos em cache compartilhado ou logs.

### Implementação e validação da 18B

- `public.export_account_data_v1()` não recebe argumentos, deriva a identidade exclusivamente de
  `auth.uid()`, é `STABLE`, `SECURITY INVOKER`, usa `search_path = pg_catalog` e mantém RLS como
  barreira final;
- `EXECUTE` é concedido somente a `authenticated`; `anon` e `PUBLIC` não possuem execução;
- os limites técnicos provisórios são 100 Projects, 25.000 Transactions, 256 KiB por
  `additional_data` e 20 MiB para o conteúdo exportável antes da compressão;
- o endpoint autenticado `POST /api/account/export` obtém a identidade por `auth.getUser()`, chama a
  RPC sem aceitar ownership do browser, revalida o snapshot e devolve ZIP binário sem Base64;
- respostas usam `Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` e `nosniff`; o ZIP não
  é persistido em banco, filesystem, estado React ou storage do navegador;
- as migrations `202608300001_create_account_export_snapshot.sql` e
  `202608300002_limit_account_export_transfer_size.sql` foram promovidas ao staging, cujo plano de
  migrations ficou vazio;
- testes locais com sessões reais comprovaram isolamento A↔B, RLS, conta vazia, conta com dados,
  headers, conteúdo, precisão monetária, datas e ausência de material secreto;
- o aceite manual no staging confirmou os oito arquivos para uma conta vazia e, para uma conta com
  dados, o Project e a Transaction esperados, seus relacionamentos, moeda, origem, data e valor;
- o painel **Seus dados** e o botão **Baixar meus dados**, originalmente reservados à experiência da
  18D, foram antecipados para a 18B4 e fazem parte do PASS da 18B. Edição cadastral e exclusão
  permanecem pendentes.

## Exclusão da conta

A decisão aprovada é exclusão imediata e irreversível dos dados ativos. O fluxo planejado exige:

1. sessão autenticada válida;
2. reautenticação com senha;
3. recomendação explícita para exportar os dados;
4. digitação da palavra `EXCLUIR`;
5. operação server-side que deriva a identidade da sessão;
6. commit integral antes de informar sucesso;
7. invalidação da sessão e remoção dos cookies aplicáveis;
8. limpeza, no dispositivo atual, somente de preferências atribuíveis à conta excluída.

A operação deverá remover a linha correspondente de `auth.users` e comprovar a cascata de:

- `user_profiles`;
- `projects`;
- `transactions`;
- `import_profiles`;
- `import_runs`;
- `project_preferences`.

Não haverá período de arrependimento nesta fase. Não há assinatura, colaboração ou obrigação de
cobrança a tratar. O desenho deverá ser reavaliado quando esses recursos existirem. A chave global
legada não atribuída não será removida automaticamente.

O mecanismo privilegiado estritamente necessário para apagar `auth.users` ainda será auditado na
18C. Nenhuma chave administrativa pode chegar ao browser e nenhum ID fornecido pelo cliente pode
determinar qual conta será excluída.

## Retenção aprovada e pendente

| Superfície                  | Decisão atual                                                               | Estado   |
| --------------------------- | --------------------------------------------------------------------------- | -------- |
| Dados no banco ativo        | manter enquanto a conta estiver ativa                                       | aprovada |
| Dados ativos após exclusão  | excluir imediatamente após confirmação e commit                             | aprovada |
| Expiração por inatividade   | não implementar no MVP                                                      | aprovada |
| Backups                     | prazo e descarte dependem da arquitetura e restore da Sprint 19             | pendente |
| Logs técnicos               | prazo depende da observabilidade da Sprint 19                               | pendente |
| Suporte e solicitações LGPD | prazo depende de revisão jurídica                                           | pendente |
| Staging e Mailtrap          | somente dados fictícios; remover mensagens e fixtures quando desnecessárias | aprovada |

Mesmo antes dos prazos definitivos, logs devem ser minimizados e não podem conter senhas, tokens,
cookies ou conteúdo financeiro. A futura comunicação pública não poderá afirmar eliminação física
imediata de backups sem evidência da operação definida na Sprint 19. Dados apagados não devem ser
restaurados como uma conta ativa sem tratamento compatível com a política aprovada.

## Cookies e armazenamento do navegador

O estado atual identificado contém:

- cookies estritamente necessários do Supabase Auth para sessão e renovação;
- `smart-finance.theme`, preferência visual do dispositivo;
- preferência de Project ativo namespaced por usuário e dispositivo;
- chaves de workspace financeiro local usadas somente em desenvolvimento/testes;
- chave global legada não atribuída, que não é lida ou migrada automaticamente no modo comercial.

Não foi identificado tracker, pixel publicitário ou analytics opcional. Portanto, a decisão atual é
não exibir banner genérico de cookies. Essa conclusão deverá ser revista se Sprint 19 ou Sprint 20
adicionar tecnologia opcional que exija outra base legal ou consentimento.

## Serviços externos e subprocessadores

| Serviço                    | Uso atual                                      | Decisão preliminar                        |
| -------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Supabase                   | Auth, sessão, PostgreSQL e dados financeiros   | serviço essencial                         |
| Cloudflare                 | Worker, HTTPS e entrega da aplicação           | serviço essencial                         |
| Mailtrap                   | captura de e-mails de Auth no staging          | somente staging                           |
| Google Fonts               | fontes solicitadas externamente pelo navegador | manter até revisão da Sprint 20           |
| GitHub, Lovable e OneDrive | desenvolvimento e armazenamento de código      | não devem receber dados reais de usuários |

A classificação pública definitiva depende de revisão jurídica. Antes de produção, o inventário
deverá ser refeito e incluir o SMTP transacional escolhido. Nenhum outro fornecedor operacional foi
identificado no estado atual do repositório.

## Mercado, idade e correção cadastral

- mercado inicial: Brasil;
- idioma: português;
- moeda: BRL;
- idade mínima: 18 anos;
- nome: edição self-service prevista para a Sprint 18;
- e-mail: alteração inicialmente mediada por suporte.

O procedimento de mudança de e-mail não pode ser anunciado antes de existir canal real e processo
seguro. Expansão internacional ou atendimento a menores exige nova revisão jurídica e de produto.

## Bloqueios antes da 18E

Antes de publicar Política de Privacidade e Termos como definitivos, será necessário definir:

- controlador e informações formais aplicáveis;
- contato real de suporte/LGPD;
- compromisso operacional de atendimento;
- categorias, finalidades, bases legais e direitos em redação juridicamente revisada;
- retenção conhecida e limitações de backup;
- subprocessadores e transferências internacionais aplicáveis;
- versão e vigência dos documentos.

## Fronteira com as próximas Sprints

- 18B implementou e validou a exportação integral e portabilidade no staging.
- 18C implementará e provará a exclusão segura no servidor e no banco.
- 18D implementará correção de nome e exclusão em Configurações; a experiência de exportação já foi
  antecipada e concluída na 18B4.
- 18E publicará Privacidade, Termos, suporte e explicações de storage somente após resolver seus
  bloqueios.
- 18F promoverá e validará a Sprint 18 em staging.
- Sprint 19 tratará backup/restore, observabilidade, logs, prazos operacionais e proteção contra
  abuso.
- Sprint 20 tratará produção, domínio, SMTP transacional, branding e reavaliação de Google Fonts.
- Sprint 21 tratará monetização.

O PASS da 18B declara concluída somente a exportação e portabilidade. Nenhuma capacidade reservada
à 18C-21 é antecipada por este documento.
