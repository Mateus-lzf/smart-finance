import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, HardDrive, Lock, LogOut, Mail, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { productTitle } from "@/lib/product-config";
import { Panel } from "@/components/app/panel";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { persistTheme, readStoredTheme, type Theme } from "@/lib/theme-service";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: productTitle("Configurações da conta") },
      {
        name: "description",
        content: "Ajuste perfil, tema, idioma, plano e integrações da sua conta.",
      },
      { property: "og:title", content: productTitle("Configurações da conta") },
      { property: "og:description", content: "Perfil, aparência, idioma e plano em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfigPage,
});

const themes = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
] as const;

const integrations = [
  { name: "Conta bancária (Open Finance)", desc: "Sincronize extratos automaticamente" },
  { name: "Nota fiscal eletrônica", desc: "Importe suas NF-e emitidas" },
  { name: "Google Sheets", desc: "Mantenha planilhas espelhadas" },
  { name: "WhatsApp", desc: "Receba resumos financeiros" },
];

function ConfigPage() {
  const [theme, setTheme] = useState<Theme>("light");
  const { user, logout, signingOut } = useAuth();

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    persistTheme(nextTheme);
  }

  async function handleLogout() {
    if (!(await logout())) toast.error("Não foi possível sair agora. Tente novamente.");
  }

  return (
    <AppShell title="Configurações" description="Sua conta, aparência e integrações">
      <div className="grid min-w-0 max-w-4xl gap-5 [&>*]:min-w-0">
        <Panel title="Conta" subtitle="Identidade usada para acessar o Smart Finance">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                <Mail className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">E-mail da conta</p>
                <p className="truncate text-sm font-medium">
                  {user.email ?? "E-mail não informado"}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} disabled={signingOut}>
              <LogOut className="size-4" /> {signingOut ? "Saindo..." : "Sair da conta"}
            </Button>
          </div>
        </Panel>

        <Panel title="Armazenamento" subtitle="Onde seus dados financeiros ficam nesta versão">
          <div className="rounded-xl border border-border bg-muted/35 p-4">
            <div className="flex gap-3">
              <HardDrive className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Dados salvos somente neste dispositivo</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Seus projetos e lançamentos continuam armazenados localmente neste navegador. A
                  conta protege o acesso ao produto, mas os dados financeiros ainda não são
                  sincronizados com ela nem com outros dispositivos.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> Entrar ou sair da conta não apaga nem
                  transfere seus dados locais.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Tema" subtitle="Escolha como a interface aparece para você">
          <div className="flex gap-3">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTheme(t.id)}
                className={cn(
                  "flex-1 rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-primary/40",
                  theme === t.id && "border-primary/60 bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "mb-2 block h-14 rounded-lg border border-border",
                    t.id === "light" ? "bg-[oklch(0.99_0.003_106)]" : "bg-[oklch(0.2_0.006_106)]",
                  )}
                />
                <span className="flex items-center gap-1.5 font-medium">
                  {t.label}
                  {theme === t.id && <Check className="size-3.5 text-primary" />}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Integrações" subtitle="Em breve nesta conta">
          <ul className="space-y-3">
            {integrations.map((i) => (
              <li
                key={i.name}
                className="flex min-w-0 items-center justify-between gap-4 opacity-60"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Lock className="size-3.5" /> {i.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{i.desc}</p>
                </div>
                <Switch disabled />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
}
