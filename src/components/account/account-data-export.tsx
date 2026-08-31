import { useRef, useState } from "react";
import { Download, FileArchive, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  AccountExportClientError,
  downloadAccountExport,
} from "@/lib/account-export/account-export-download-client";

const errorMessages = {
  REQUEST_FORBIDDEN: "Não foi possível validar a solicitação. Atualize a página e tente novamente.",
  LIMIT_EXCEEDED: "O volume da sua conta excede o limite atual de exportação.",
  UNAVAILABLE: "A exportação está temporariamente indisponível. Tente novamente mais tarde.",
  INVALID_RESPONSE: "Não foi possível validar o arquivo gerado. Tente novamente mais tarde.",
  NETWORK: "Não foi possível conectar para preparar a exportação. Verifique sua conexão.",
} as const;

export function AccountDataExport() {
  const { refresh } = useAuth();
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);

  async function handleDownload() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);

    try {
      await downloadAccountExport();
      toast.success("Download iniciado.");
    } catch (error) {
      if (!(error instanceof AccountExportClientError)) {
        toast.error(errorMessages.UNAVAILABLE);
        return;
      }
      if (error.code === "AUTHENTICATION_REQUIRED") {
        let refreshed = false;
        try {
          refreshed = await refresh();
        } catch {
          refreshed = false;
        }
        if (refreshed) {
          toast.error("Sua sessão foi atualizada. Tente baixar novamente.");
        } else {
          window.location.assign("/login?reason=session_expired&redirect=%2Fconfiguracoes");
        }
        return;
      }
      toast.error(errorMessages[error.code]);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return (
    <Panel title="Seus dados" subtitle="Baixe uma cópia portátil das informações da sua conta">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/35 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
            <FileArchive className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-6 text-muted-foreground">
              A exportação contém dados da conta, projetos, lançamentos, importações e preferências.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" /> Proteja o arquivo: ele pode conter
              informações financeiras sensíveis.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={exporting}
          aria-busy={exporting}
          onClick={() => void handleDownload()}
        >
          {exporting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exporting ? "Preparando arquivo..." : "Baixar meus dados"}
        </Button>
      </div>
    </Panel>
  );
}
