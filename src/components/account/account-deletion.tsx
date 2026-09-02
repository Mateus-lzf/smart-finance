import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { Panel } from "@/components/app/panel";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AccountDeletionClientError,
  canSubmitAccountDeletion,
  deleteCurrentAccount,
  type AccountDeletionClientErrorCode,
} from "@/lib/account-deletion/account-deletion-client";
import { useAuth } from "@/lib/auth/auth-provider";
import { removeBrowserActiveProjectPreference } from "@/lib/active-project-preference";

const errorMessages: Record<AccountDeletionClientErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Sua sessão expirou. Entre novamente antes de excluir sua conta.",
  INVALID_CONFIRMATION: "Digite EXCLUIR exatamente como solicitado.",
  INVALID_PASSWORD: "A senha informada está incorreta.",
  REAUTHENTICATION_REQUIRED: "Confirme novamente sua senha para excluir a conta.",
  REAUTHENTICATION_EXPIRED: "A confirmação da senha expirou. Tente novamente.",
  REAUTHENTICATION_UNAVAILABLE:
    "Não foi possível confirmar sua senha agora. Tente novamente mais tarde.",
  REQUEST_FORBIDDEN: "Não foi possível validar a solicitação. Atualize a página e tente novamente.",
  UNAVAILABLE: "Não foi possível excluir sua conta agora. Tente novamente mais tarde.",
  INVALID_RESPONSE: "Não foi possível confirmar a exclusão. Tente novamente mais tarde.",
  NETWORK: "Não foi possível conectar. Verifique sua conexão e tente novamente.",
};

export function AccountDeletion() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const confirmationRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  function clearSensitiveState() {
    setConfirmation("");
    setPassword("");
    setErrorMessage("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (submittingRef.current) return;
    setOpen(nextOpen);
    if (!nextOpen) clearSensitiveState();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitAccountDeletion(confirmation, password, submittingRef.current)) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const result = await deleteCurrentAccount(confirmation, password);
      removeBrowserActiveProjectPreference(user.id);
      clearSensitiveState();
      window.location.assign(result.redirectTo);
    } catch (error) {
      const code =
        error instanceof AccountDeletionClientError ? error.code : ("UNAVAILABLE" as const);
      setErrorMessage(errorMessages[code]);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const canSubmit = canSubmitAccountDeletion(confirmation, password, submitting);

  return (
    <Panel title="Excluir conta" subtitle="Remova permanentemente sua conta e seus dados">
      <div className="flex flex-col gap-4 rounded-xl border border-destructive/35 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Exclusão permanente e irreversível</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Sua conta, projetos, lançamentos, importações e preferências serão removidos. Antes de
              continuar, recomendamos baixar uma cópia em Seus dados.
            </p>
          </div>
        </div>

        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" className="shrink-0">
              <Trash2 className="size-4" /> Excluir minha conta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent
            className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              confirmationRef.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (submittingRef.current) event.preventDefault();
            }}
          >
            <form onSubmit={(event) => void handleSubmit(event)}>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir sua conta permanentemente?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    Esta ação remove sua conta e todos os dados financeiros associados e não pode
                    ser desfeita.
                  </span>
                  <span className="block">
                    Se precisar guardar uma cópia, cancele e use Baixar meus dados antes de excluir.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="my-5 grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="account-deletion-confirmation">
                    Digite EXCLUIR para confirmar
                  </Label>
                  <Input
                    ref={confirmationRef}
                    id="account-deletion-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    disabled={submitting}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account-deletion-password">Senha atual</Label>
                  <Input
                    id="account-deletion-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                  />
                </div>
                <p
                  className="min-h-5 text-sm text-destructive"
                  role={errorMessage ? "alert" : "status"}
                  aria-live="polite"
                >
                  {errorMessage}
                </p>
              </div>

              <AlertDialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => handleOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={!canSubmit}>
                  {submitting && <LoaderCircle className="size-4 animate-spin" />}
                  {submitting ? "Excluindo conta..." : "Excluir conta permanentemente"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Panel>
  );
}
