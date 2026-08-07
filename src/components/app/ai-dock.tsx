import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/app-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AiConversation } from "./ai-conversation";

export function AiDock() {
  const { aiOpen, setAiOpen, project } = useApp();
  return (
    <Sheet open={aiOpen} onOpenChange={setAiOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-3.5" />
            </span>
            Análises de {project?.name ?? "seu projeto"}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 p-4">
          <AiConversation compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
