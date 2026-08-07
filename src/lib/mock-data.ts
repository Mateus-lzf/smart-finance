export type Insight = {
  id: string;
  level: "oportunidade" | "atencao" | "critico";
  title: string;
  body: string;
  metric?: string;
  action: string;
};

export function brl(value: number, compact = false) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}
