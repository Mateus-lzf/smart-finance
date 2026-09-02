import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { productTitle } from "@/lib/product-config";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: productTitle("Privacidade") },
      {
        name: "description",
        content: "Entenda como a versão atual do Smart Finance utiliza e protege seus dados.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacidade"
      description="Este documento descreve, em linguagem simples, o tratamento de dados comprovado na versão atual do Smart Finance. O texto será revisto antes do lançamento comercial."
    >
      <h2>Dados utilizados</h2>
      <p>
        A aplicação utiliza nome, e-mail e dados técnicos necessários à autenticação. Quando você
        usa o produto, também trata projetos, lançamentos financeiros, arquivos importados,
        mapeamentos de importação, preferências e metadados técnicos necessários ao funcionamento e
        à integridade das operações.
      </p>
      <h2>Para que os dados são usados</h2>
      <p>
        Esses dados permitem criar e proteger sua conta, organizar projetos e lançamentos, importar
        arquivos CSV ou XLSX, exibir indicadores, análises e relatórios, preservar preferências e
        oferecer exportação e exclusão da conta.
      </p>
      <h2>Armazenamento e acesso</h2>
      <p>
        No modo comercial, os dados financeiros são armazenados remotamente e vinculados à conta
        autenticada. O Supabase fornece autenticação e persistência, e o Cloudflare Worker entrega a
        aplicação. Controles de acesso e isolamento por conta impedem que um usuário consulte ou
        altere os dados de outro usuário pelas operações disponíveis no produto.
      </p>
      <p>
        O navegador mantém cookies estritamente necessários à sessão e preferências funcionais do
        dispositivo, como tema, estado da navegação lateral e projeto ativo. O workspace financeiro
        remoto não usa o armazenamento local do navegador como fonte de verdade.
      </p>
      <h2>Importação, exportação e exclusão</h2>
      <p>
        Arquivos CSV e XLSX selecionados pelo usuário são processados para importar lançamentos. Em
        Configurações, é possível baixar um pacote com os dados da conta e solicitar a exclusão
        permanente dos dados ativos depois de reautenticação e confirmação explícita.
      </p>
      <p>
        A exclusão dos dados ativos não significa eliminação imediata de eventuais cópias de
        segurança. Os prazos e procedimentos de backup e retenção ainda serão definidos e revisados
        antes do lançamento comercial.
      </p>
      <h2>Serviços e tecnologias atuais</h2>
      <p>
        Supabase e Cloudflare são necessários ao funcionamento atual. As fontes visuais são
        carregadas pelo Google Fonts. Não há, nesta versão, ferramenta opcional de publicidade,
        pixel de rastreamento ou analytics de comportamento, nem pagamentos ou assinaturas.
      </p>
      <h2>Seus controles</h2>
      <p>
        A área de Configurações permite exportar os dados e excluir a conta sem intervenção manual.
        A identificação formal do responsável pelo tratamento, os canais de contato, as bases legais
        detalhadas e os prazos definitivos de retenção serão publicados após definição e revisão
        próprias, antes do lançamento comercial.
      </p>
      <h2>Atualizações deste documento</h2>
      <p>
        Este texto acompanha a versão atual do produto e pode mudar à medida que funcionalidades,
        fornecedores e práticas operacionais forem definidos. A versão destinada ao lançamento
        comercial passará por revisão apropriada antes de ser publicada como documento definitivo.
      </p>
    </LegalPage>
  );
}
