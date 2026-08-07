import { Sparkles } from "lucide-react";

export function AiConversation({ compact: _compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Sparkles className="size-4" />
      </span>
      <p className="mt-4 text-sm font-medium">Análises automáticas indisponíveis</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Ainda não há dados suficientes para gerar este insight.
      </p>
    </div>
  );
}
