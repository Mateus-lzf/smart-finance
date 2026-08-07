import { RevenueBars, CashFlowArea, CategoryDonut } from "./charts";

export function AnswerViz({ viz }: { viz: "bars" | "line" | "donut" | "table" | "none" }) {
  if (viz === "none") return null;
  return (
    <div className="surface p-3">
      {viz === "bars" && <RevenueBars height={180} />}
      {viz === "line" && <CashFlowArea height={180} />}
      {viz === "donut" && <CategoryDonut height={160} />}
      {viz === "table" && (
        <p className="py-5 text-center text-sm text-muted-foreground">
          Ainda não há dados suficientes para gerar este insight.
        </p>
      )}
    </div>
  );
}
