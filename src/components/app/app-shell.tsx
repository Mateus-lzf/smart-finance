import { Link, useRouterState } from "@tanstack/react-router";
import {
  FolderKanban,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Check,
  ChevronsUpDown,
  Plus,
  Menu,
  HardDrive,
  Cloud,
  LogOut,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-store";
import { useAuth } from "@/lib/auth/auth-provider";
import { appNavigation } from "@/lib/app-navigation";
import { PRODUCT_NAME } from "@/lib/product-config";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function AccountSummary({ collapsed = false }: { collapsed?: boolean }) {
  const { user, logout, signingOut } = useAuth();
  const { financialMode } = useApp();

  async function handleLogout() {
    const ok = await logout();
    if (!ok) toast.error("Não foi possível sair agora. Tente novamente.");
  }

  if (collapsed) {
    return (
      <button
        onClick={handleLogout}
        disabled={signingOut}
        className="grid w-full place-items-center rounded-lg py-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
        title={`Sair de ${user.email ?? "sua conta"}`}
        aria-label="Sair da conta"
      >
        <LogOut className="size-4" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-sidebar-border p-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-hover text-sidebar-primary">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-sidebar-foreground">
            {user.email ?? "Conta Smart Finance"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-sidebar-foreground/60">
            {financialMode === "remote" ? (
              <>
                <Cloud className="size-3" /> Dados sincronizados com a conta
              </>
            ) : (
              <>
                <HardDrive className="size-3" /> Dados neste dispositivo
              </>
            )}
          </p>
        </div>
        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/55 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground disabled:opacity-50"
          title="Sair da conta"
          aria-label="Sair da conta"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { project, projects, setProjectId } = useApp();
  if (!project) {
    return (
      <Link
        to="/projetos"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-sidebar-hover text-sidebar-primary">
          <FolderKanban className="size-4" />
        </span>
        {!collapsed && <span>Criar projeto</span>}
      </Link>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border px-2 py-2 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-hover",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-hover text-sidebar-primary">
            <FolderKanban className="size-4" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{project.name}</span>
                <span className="block truncate text-xs text-sidebar-foreground/65">
                  {project.type || "Projeto financeiro"}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-foreground/60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Seus projetos
        </DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => {
              void setProjectId(p.id).catch((cause) =>
                toast.error(
                  cause instanceof Error ? cause.message : "Não foi possível selecionar o projeto.",
                ),
              );
            }}
            className="gap-2"
          >
            <FolderKanban className="size-3.5" />
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === project.id && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/criar" className="gap-2">
            <Plus className="size-3.5" /> Novo projeto
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 md:flex",
          collapsed ? "w-[68px]" : "w-[248px]",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight">{PRODUCT_NAME}</span>
          )}
        </div>

        <div className="px-2">
          <ProjectSwitcher collapsed={collapsed} />
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2">
          {appNavigation.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={item.label}
              >
                <item.icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} />
                {!collapsed && <span>{item.label}</span>}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-2">
          <AccountSummary collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "mt-1",
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && <span>Recolher</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu className="size-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
                {description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{description}</p>
                )}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="flex w-[280px] flex-col bg-sidebar p-3">
          <SheetHeader className="px-1 py-2 text-left">
            <SheetTitle className="flex items-center gap-2 text-[15px]">
              <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Sparkles className="size-4" />
              </span>
              {PRODUCT_NAME}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-2">
            <ProjectSwitcher collapsed={false} />
          </div>
          <nav className="mt-4 flex flex-col gap-1">
            {appNavigation.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground",
                    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto pt-4">
            <AccountSummary />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
