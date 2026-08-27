import { motion } from "framer-motion";
import { BookMarked, Brain, Languages, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GlossaryItem, MemoryItem } from "@/lib/api";
import type { UiCopy } from "@/lib/i18n";

export default function MemoryPanel({
  memories,
  glossary,
  copy,
  onDelete,
  onClear,
}: {
  memories: MemoryItem[];
  glossary: GlossaryItem[];
  copy: UiCopy;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Brain className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="truncate text-sm font-semibold">{copy.memory.title}</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <BookMarked className="h-3.5 w-3.5" /> {copy.memory.memories} ({memories.length})
            {memories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(copy.memory.clearConfirm)) onClear();
                }}
                className="ml-auto h-6 rounded-md px-2 text-[10px] text-red-500 hover:text-red-500"
                title={copy.memory.clearAll}
                aria-label={copy.memory.clearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {copy.memory.clearAll}
              </Button>
            )}
          </div>
          <div className="space-y-1.5">
            {memories.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="group rounded-lg border bg-card px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium" title={m.title}>
                    {m.title}
                  </p>
                  <Badge
                    className={
                      m.memory_type === "long_term"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-500"
                    }
                  >
                    {m.memory_type === "long_term" ? copy.memory.long : copy.memory.session}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(m.id)}
                    className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    title={copy.memory.removeOne}
                    aria-label={copy.memory.removeOne}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {m.content && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{m.content}</p>
                )}
                {m.entity && (
                  <p className="mt-1 text-[10px] text-muted-foreground">↳ {m.entity}</p>
                )}
              </motion.div>
            ))}
            {memories.length === 0 && (
              <p className="text-center text-[11px] text-muted-foreground">
                {copy.memory.emptyMemories}
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Languages className="h-3.5 w-3.5" /> {copy.memory.glossary} ({glossary.length})
          </div>
          <div className="space-y-1">
            {glossary.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="font-medium">{g.source}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-primary">{g.target}</span>
              </div>
            ))}
            {glossary.length === 0 && (
              <p className="text-center text-[11px] text-muted-foreground">{copy.memory.emptyGlossary}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
