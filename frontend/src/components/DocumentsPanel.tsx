import { FormEvent, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Download,
  File,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Image,
  Inbox,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, fmtBytes } from "@/lib/utils";
import {
  clearDocuments,
  consolidateDocuments,
  createDocumentGroup,
  deleteDocument,
  deleteDocumentGroup,
  updateDocument,
  uploadFile,
  type DocItem,
} from "@/lib/api";
import type { UiCopy } from "@/lib/i18n";

function extIcon(ext: string) {
  if (ext === ".pdf") return FileText;
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") return FileSpreadsheet;
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return Image;
  return File;
}

function groupIcon(name: string) {
  if (name === "Inputs") return Inbox;
  if (name === "Outputs") return Sparkles;
  return Folder;
}

function defaultGroup(doc: DocItem) {
  return doc.group || (doc.role === "output" ? "Outputs" : "Inputs");
}

export default function DocumentsPanel({
  docs,
  groups,
  onChange,
  copy,
}: {
  docs: DocItem[];
  groups: string[];
  onChange: () => void;
  copy: UiCopy;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const allGroups = useMemo(() => {
    const seen = new Set(["Inputs", "Outputs", ...groups, ...docs.map(defaultGroup)]);
    return Array.from(seen).filter(Boolean);
  }, [docs, groups]);

  const shelves = useMemo(
    () =>
      allGroups.map((name) => ({
        name,
        files: docs.filter((d) => defaultGroup(d) === name),
      })),
    [allGroups, docs]
  );

  const outputCount = docs.filter((d) => (d.role || "input") === "output").length;
  const inputCount = docs.length - outputCount;
  const displayGroup = (name: string) =>
    name === "Inputs" || name === "Outputs" ? copy.documents.groupLabels[name] : name;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadFile(f);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function addGroup(e: FormEvent) {
    e.preventDefault();
    const name = newGroup.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createDocumentGroup(name);
      setNewGroup("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function moveDoc(doc: DocItem, group: string) {
    const role = group === "Outputs" ? "output" : group === "Inputs" ? "input" : doc.role;
    await updateDocument(doc.name, { group, role });
    onChange();
  }

  async function removeDoc(doc: DocItem) {
    if (!window.confirm(copy.documents.deleteConfirm(doc.name))) return;
    await deleteDocument(doc.name);
    onChange();
  }

  async function clearAll() {
    if (!docs.length) return;
    if (!window.confirm(copy.documents.clearConfirm(docs.length))) return;
    await clearDocuments();
    onChange();
  }

  async function consolidateAll() {
    setBusy(true);
    try {
      const result = await consolidateDocuments();
      window.alert(copy.documents.consolidateDone(result.updated ?? 0));
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function removeGroup(name: string) {
    if (!window.confirm(copy.documents.removeGroupConfirm(name))) {
      return;
    }
    await deleteDocumentGroup(name);
    onChange();
  }

  function toggleGroup(name: string) {
    setCollapsedGroups((current) => ({ ...current, [name]: !current[name] }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FilePlus2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{copy.documents.title}</h2>
        <Badge className="ml-auto border-border bg-secondary text-[10px] text-muted-foreground">
          {docs.length} {copy.documents.files}
        </Badge>
      </div>

      <div className="space-y-2.5 border-b p-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2.5 transition-colors",
            drag ? "border-primary bg-accent/40" : "border-border hover:border-primary/50"
          )}
        >
          <Upload className={cn("h-4 w-4 text-muted-foreground", busy && "animate-bounce")} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">{busy ? copy.documents.working : copy.documents.drop}</p>
            <p className="text-[10px] text-muted-foreground">{copy.documents.uploadHint}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{inputCount} {copy.documents.inputs}</span>
          <span className="h-1 w-1 rounded-full bg-border" />
          <span>{outputCount} {copy.documents.outputs}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={consolidateAll}
            disabled={!docs.length || busy}
            className="ml-auto h-6 rounded-md px-2 text-[10px] text-muted-foreground"
            title={copy.documents.consolidateTitle}
            aria-label={copy.documents.consolidateTitle}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {copy.documents.consolidate}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={!docs.length || busy}
            className="h-6 rounded-md px-2 text-[10px] text-red-500 hover:text-red-500"
            title={copy.documents.clearTitle}
            aria-label={copy.documents.clearTitle}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {copy.documents.clear}
          </Button>
        </div>

        <form onSubmit={addGroup} className="flex gap-1.5">
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder={copy.documents.newGroup}
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={busy}
            title={copy.documents.createGroup}
            aria-label={copy.documents.createGroup}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </form>

      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {shelves.map(({ name, files }) => {
          const ShelfIcon = groupIcon(name);
          const collapsed = Boolean(collapsedGroups[name]);
          return (
            <section key={name} className="border-b py-2.5 last:border-b-0">
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(name)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-secondary/60"
                  title={collapsed ? copy.documents.expandGroup(name) : copy.documents.collapseGroup(name)}
                  aria-label={collapsed ? copy.documents.expandGroup(name) : copy.documents.collapseGroup(name)}
                  aria-expanded={!collapsed}
                >
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                      !collapsed && "rotate-90"
                    )}
                  />
                  <ShelfIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{displayGroup(name)}</h3>
                  <span className="text-[10px] text-muted-foreground">{files.length}</span>
                </button>
                {name !== "Inputs" && name !== "Outputs" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-red-500"
                    onClick={() => removeGroup(name)}
                    title={copy.documents.removeGroup(name)}
                    aria-label={copy.documents.removeGroup(name)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {!collapsed && <div className="space-y-1">
                {files.map((d) => {
                  const Icon = extIcon(d.ext);
                  return (
                    <motion.div
                      key={d.name}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="group rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-secondary/50"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="min-w-0 flex-1 truncate text-xs font-medium" title={d.name}>
                          {d.name}
                        </p>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title={copy.documents.download(d.name)}
                        >
                          <a
                            href={d.url ?? `/files/${encodeURIComponent(d.name)}`}
                            download
                            aria-label={copy.documents.download(d.name)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                          onClick={() => removeDoc(d)}
                          title={copy.documents.delete(d.name)}
                          aria-label={copy.documents.delete(d.name)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mt-1 flex items-center gap-2 pl-6">
                        <span className="text-[10px] text-muted-foreground">{fmtBytes(d.size)}</span>
                        <select
                          value={defaultGroup(d)}
                          onChange={(e) => moveDoc(d, e.target.value)}
                          className="ml-auto max-w-[140px] rounded-md border bg-background px-1.5 py-1 text-[10px] text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                          title={copy.documents.moveToGroup(d.name)}
                          aria-label={copy.documents.moveToGroup(d.name)}
                        >
                          {allGroups.map((g) => (
                            <option key={g} value={g}>
                              {displayGroup(g)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </motion.div>
                  );
                })}
                {files.length === 0 && (
                  <p className="rounded-md border border-dashed px-2 py-2 text-[10px] text-muted-foreground">
                    {copy.documents.emptyGroup}
                  </p>
                )}
              </div>}
            </section>
          );
        })}

        {docs.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">{copy.documents.empty}</p>
        )}
      </div>
    </div>
  );
}
