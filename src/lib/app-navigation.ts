import { BarChart3, Table2, Lightbulb, FileText, Settings, FolderKanban } from "lucide-react";

export const appNavigation = [
  { to: "/projetos", label: "Projetos", icon: FolderKanban },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/dados", label: "Dados", icon: Table2 },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;
