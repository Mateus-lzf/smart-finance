import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: productTitle("Termos de Uso") },
      {
        name: "description",
        content: "Conheça as condições de uso da versão atual do Smart Finance.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      description="Estas condições descrevem a versão em desenvolvimento do Smart Finance e serão revistas antes do lançamento comercial."
    >
      <h2>Finalidade do produto</h2>
      <p>
        O Smart Finance ajuda pessoas maiores de 18 anos a organizar projetos e lançamentos
        financeiros, importar planilhas e consultar dashboards, indicadores, análises e relatórios.
        Nesta versão não há plano pago, assinatura ou cobrança.
      </p>
      <h2>Conta e segurança</h2>
      <p>
        Você deve fornecer informações corretas, manter sua senha protegida e usar somente a própria
        conta. Informe qualquer suspeita de acesso indevido quando os canais oficiais de atendimento
        forem publicados.
      </p>
      <h2>Dados inseridos e importados</h2>
      <p>
        Você é responsável pela legitimidade, correção e autorização de uso dos dados que cadastrar
        ou importar. Antes de confirmar uma importação ou reimportação, revise os mapeamentos e a
        prévia apresentada pela aplicação.
      </p>
      <h2>Uso adequado</h2>
      <p>
        Não use o produto para violar direitos, praticar atos ilegais, tentar acessar contas
        alheias, contornar controles de segurança, sobrecarregar deliberadamente o serviço ou
        interferir em seu funcionamento.
      </p>
      <h2>Informações financeiras</h2>
      <p>
        Dashboards, indicadores, insights e relatórios organizam os dados fornecidos pelo usuário e
        têm caráter informativo. Revise os dados de origem e os resultados antes de tomar decisões
        financeiras. O produto não substitui orientação profissional adequada ao seu caso.
      </p>
      <h2>Exportação e exclusão</h2>
      <p>
        A área de Configurações permite baixar os dados da conta. Também permite excluir a conta e
        os dados ativos de forma permanente, mediante reautenticação e confirmação explícita. É
        recomendável exportar os dados antes de confirmar a exclusão.
      </p>
      <h2>Evolução e disponibilidade</h2>
      <p>
        O produto continua em desenvolvimento e suas funcionalidades podem evoluir. Não é anunciado
        nesta versão compromisso de disponibilidade contínua, nível de serviço ou funcionalidade
        futura específica.
      </p>
      <h2>Atualizações destes termos</h2>
      <p>
        Este texto reflete apenas as capacidades atuais. A identificação formal do responsável, os
        canais de atendimento e as condições jurídicas definitivas serão definidos e revisados antes
        do lançamento comercial.
      </p>
    </LegalPage>
  );
}
