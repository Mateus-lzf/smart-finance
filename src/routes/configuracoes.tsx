import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { Panel } from "@/components/app/panel";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações da conta — Clareza" },
      {
        name: "description",
        content: "Ajuste perfil, tema, idioma, plano e integrações da sua conta.",
      },
      { property: "og:title", content: "Configurações da conta — Clareza" },
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
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <AppShell title="Configurações" description="Sua conta, aparência e integrações">
      <div className="grid max-w-4xl gap-5">
        <Panel title="Tema" subtitle="Escolha como a interface aparece para você">
          <div className="flex gap-3">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
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
              <li key={i.name} className="flex items-center justify-between gap-4 opacity-60">
                <div>
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
