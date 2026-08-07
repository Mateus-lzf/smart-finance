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
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-store";
import { appNavigation } from "@/lib/app-navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { project, projects, setProjectId } = useApp();
  if (!project) {
    return (
      <Link
        to="/projetos"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-card shadow-soft">
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
            "flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-base shadow-soft">
            <FolderKanban className="size-4" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{project.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {project.type || "Projeto financeiro"}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Seus projetos
        </DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => setProjectId(p.id)} className="gap-2">
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
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight">
              Clareza<span className="text-primary">.</span>
            </span>
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
                  "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                  collapsed && "justify-center px-0",
                )}
                title={item.label}
              >
                <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                {!collapsed && <span>{item.label}</span>}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent",
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

        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-1 px-5 py-6 md:px-8"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-3">
          <SheetHeader className="px-1 py-2 text-left">
            <SheetTitle className="flex items-center gap-2 text-[15px]">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-4" />
              </span>
              Clareza<span className="-ml-2 text-primary">.</span>
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
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/80",
                    active && "bg-sidebar-accent font-medium text-sidebar-foreground",
                  )}
                >
                  <item.icon className={cn("size-4", active && "text-primary")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
