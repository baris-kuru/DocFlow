import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ChevronRight,
  FileSearch,
  FileText,
  Languages,
  Brain,
  Sparkles,
  Table,
  Wrench,
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Radio,
} from "lucide-react";
import type { UiCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ActivityEntry = {
  id: string;
  kind: "tool" | "progress" | "error";
  name: string;
  status: "running" | "done" | "error";
  args?: Record<string, unknown>;
  result?: string;
  time: string;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  list_documents: FileText,
  read_document: FileSearch,
  find_section: FileSearch,
  diff_changes: GitCompare,
  apply_changes: Wrench,
  apply_revisions: Wrench,
  detect_section_pages: FileSearch,
  extract_revisions_from_page: Sparkles,
  extract_revisions_batch: Sparkles,
  translate_text: Languages,
  translate_document: Languages,
  validate_revisions: CheckCircle2,
  inspect_revisions_hallucinations: Brain,
  inspect_revisions_consistency: Brain,
  extract_tables_from_pdf: Table,
  read_excel: Table,
  save_table_as: Table,
  save_as_docx: FileText,
};

function iconFor(name: string) {
  return ICONS[name] ?? Wrench;
}

function Entry({ e }: { e: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(e.args && Object.keys(e.args).length) || !!e.result;

  if (e.kind === "progress") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 pl-1 text-xs text-muted-foreground"
      >
        <Radio className="h-3 w-3 animate-pulse text-primary" />
        <span>{e.name}</span>
      </motion.div>
    );
  }

  const Icon = e.kind === "error" ? AlertTriangle : iconFor(e.name);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors",
          hasDetail && "hover:border-border hover:bg-secondary/60"
        )}
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            e.status === "running" && "bg-primary/15 text-primary animate-pulse-ring",
            e.status === "done" && "bg-emerald-500/15 text-emerald-500",
            e.status === "error" && "bg-red-500/15 text-red-500"
          )}
        >
          {e.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-medium">{e.name}</span>
          <span className="block text-[10px] text-muted-foreground">{e.time}</span>
        </span>
        {hasDetail && (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90"
            )}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-10 pr-2"
          >
            {e.args && Object.keys(e.args).length > 0 && (
              <pre className="mb-1 mt-1 max-h-40 overflow-auto rounded-md bg-secondary/70 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {JSON.stringify(e.args, null, 2)}
              </pre>
            )}
            {e.result && (
              <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-secondary/70 p-2 text-[10px] leading-relaxed">
                {e.result}
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ActivityRail({
  entries,
  running,
  copy,
}: {
  entries: ActivityEntry[];
  running: boolean;
  copy: UiCopy;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{copy.activity.title}</h2>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-primary">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
            {copy.activity.working}
          </span>
        )}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
            <Brain className="h-8 w-8 opacity-30" />
            <p className="max-w-[200px]">{copy.activity.empty}</p>
          </div>
        ) : (
          entries.map((e) => <Entry key={e.id} e={e} />)
        )}
      </div>
    </div>
  );
}
