import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Activity, Brain, BriefcaseBusiness, FilePlus2, FileText, PanelRightClose, PanelRightOpen } from "lucide-react";
import ChatPanel, { type ChatMessage } from "@/components/ChatPanel";
import ActivityRail, { type ActivityEntry } from "@/components/ActivityRail";
import DocumentsPanel from "@/components/DocumentsPanel";
import JobsPanel from "@/components/JobsPanel";
import MemoryPanel from "@/components/MemoryPanel";
import { Badge } from "@/components/ui/badge";
import { COPY, LOCALES, type Locale } from "@/lib/i18n";
import { cn, shortTime } from "@/lib/utils";
import {
  clearMemory,
  deleteMemory,
  health,
  listDocumentWorkspace,
  listGlossary,
  listJobs,
  listMemory,
  streamChat,
  type AgentEvent,
  type DocItem,
  type GlossaryItem,
  type JobItem,
  type MemoryItem,
} from "@/lib/api";

type Tab = "activity" | "files" | "memory" | "jobs";

const uid = () => Math.random().toString(36).slice(2, 10);

function initialLocale(): Locale {
  const saved = window.localStorage.getItem("docflow-locale");
  return saved === "de" || saved === "tr" || saved === "en" ? saved : "en";
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("activity");
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docGroups, setDocGroups] = useState<string[]>(["Inputs", "Outputs"]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [glossary, setGlossary] = useState<GlossaryItem[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [model, setModel] = useState("");
  const [keyOk, setKeyOk] = useState<boolean | null>(null);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const copy = COPY[locale];

  const threadId = useRef(uid());
  const sessionId = useRef(uid());
  const abortRef = useRef<AbortController | null>(null);

  const refreshSidebars = useCallback(async () => {
    const workspace = await listDocumentWorkspace();
    setDocs(workspace.documents);
    setDocGroups(workspace.groups);
    setMemories(await listMemory());
    setGlossary(await listGlossary());
    setJobs(await listJobs());
  }, []);

  useEffect(() => {
    health()
      .then((h) => {
        setModel(h.model);
        setKeyOk(h.fireworks_key);
      })
      .catch(() => setKeyOk(false));
    refreshSidebars();
  }, [refreshSidebars]);

  useEffect(() => {
    window.localStorage.setItem("docflow-locale", locale);
  }, [locale]);

  const send = useCallback(
    async (text: string) => {
      if (running) return;
      setRunning(true);
      setTab("activity");

      const assistantId = uid();
      setMessages((m) => [
        ...m,
        { id: uid(), role: "user", content: text },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let sawDownload = false;
      let sawFirstEvent = false;
      let timedOutBeforeStart = false;
      const timers = [
        window.setTimeout(() => {
          if (!sawFirstEvent && !ctrl.signal.aborted) {
            setActivity((a) => [
              ...a,
              { id: uid(), kind: "progress", name: copy.chat.thinking, status: "done", time: shortTime() },
            ]);
          }
        }, 1200),
        window.setTimeout(() => {
          if (!sawFirstEvent && !ctrl.signal.aborted) {
            setActivity((a) => [
              ...a,
              { id: uid(), kind: "progress", name: copy.chat.stillWaiting, status: "done", time: shortTime() },
            ]);
          }
        }, 20000),
        window.setTimeout(() => {
          if (!sawFirstEvent && !ctrl.signal.aborted) {
            timedOutBeforeStart = true;
            ctrl.abort();
          }
        }, 90000),
      ];

      const onEvent = (e: AgentEvent) => {
        sawFirstEvent = true;
        if (e.type === "token") {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + e.content } : msg
            )
          );
          if (e.content.includes("/files/")) sawDownload = true;
        } else if (e.type === "tool_start") {
          setActivity((a) => [
            ...a,
            {
              id: uid(),
              kind: "tool",
              name: e.name,
              status: "running",
              args: e.args,
              time: shortTime(),
            },
          ]);
        } else if (e.type === "tool_end") {
          setActivity((a) => {
            const i = [...a].reverse().find((x) => x.name === e.name && x.status === "running");
            if (!i) {
              return [
                ...a,
                { id: uid(), kind: "tool", name: e.name, status: "done", result: e.content, time: shortTime() },
              ];
            }
            return a.map((x) =>
              x.id === i.id ? { ...x, status: "done", result: e.content } : x
            );
          });
        } else if (e.type === "progress") {
          setActivity((a) => [
            ...a,
            { id: uid(), kind: "progress", name: e.content, status: "done", time: shortTime() },
          ]);
        } else if (e.type === "error") {
          setActivity((a) => [
            ...a,
            { id: uid(), kind: "error", name: "error", status: "error", result: e.content, time: shortTime() },
          ]);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + `\n\n⚠️ ${e.content}` }
                : msg
            )
          );
        }
      };

      try {
        await streamChat(
          { message: text, threadId: threadId.current, sessionId: sessionId.current },
          onEvent,
          ctrl.signal
        );
      } catch (err) {
        if (timedOutBeforeStart) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + `\n\n⚠️ ${copy.chat.modelTimeout}` }
                : msg
            )
          );
        } else if (!ctrl.signal.aborted) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: msg.content + `\n\n⚠️ ${copy.chat.connectionError}` }
                : msg
            )
          );
        }
      } finally {
        timers.forEach(window.clearTimeout);
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, streaming: false } : msg))
        );
        setRunning(false);
        abortRef.current = null;
        refreshSidebars();
        if (sawDownload) {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, scalar: 0.9 });
        }
      }
    },
    [
      running,
      refreshSidebars,
      copy.chat.connectionError,
      copy.chat.modelTimeout,
      copy.chat.stillWaiting,
      copy.chat.thinking,
    ]
  );

  const stop = () => abortRef.current?.abort();

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "activity", label: copy.tabs.activity, icon: Activity },
    { id: "files", label: copy.tabs.files, icon: FilePlus2 },
    { id: "memory", label: copy.tabs.memory, icon: Brain },
    { id: "jobs", label: copy.tabs.jobs, icon: BriefcaseBusiness },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-2.5 border-b bg-background px-4 py-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-card text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-none">
            Doc<span className="gradient-text">Flow</span>
          </h1>
          <p className="text-[10px] text-muted-foreground">{copy.appSubtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={copy.flagLabel}
            title={copy.flagLabel}
            className="h-7 rounded-md border bg-secondary px-1.5 text-base outline-none transition-colors hover:bg-accent focus:ring-2 focus:ring-ring"
          >
            {LOCALES.map((item) => (
              <option key={item.id} value={item.id} aria-label={item.label}>
                {item.flag}
              </option>
            ))}
          </select>
          <Badge className="border-border bg-secondary font-mono text-[10px] text-muted-foreground">
            {model.split("/").pop() || "…"}
          </Badge>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px]",
              keyOk
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                : "border-red-500/30 bg-red-500/10 text-red-500"
            )}
            title={keyOk ? copy.keyConfigured : copy.keyMissing}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                keyOk ? "bg-emerald-500" : "bg-red-500"
              )}
            />
            {keyOk === null ? copy.checking : keyOk ? copy.connected : copy.noKey}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 border-r">
          <ChatPanel messages={messages} running={running} onSend={send} onStop={stop} copy={copy} />
        </main>

        <aside
          className={cn(
            "flex shrink-0 flex-col border-l bg-background transition-[width]",
            sideCollapsed ? "w-12" : "w-[330px]"
          )}
        >
          {sideCollapsed ? (
            <div className="flex flex-col items-center gap-1 border-b p-1.5">
              <button
                onClick={() => setSideCollapsed(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Expand"
                aria-label="Expand side panel"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTab(t.id);
                      setSideCollapsed(false);
                    }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                      active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={t.label}
                    aria-label={t.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1 border-b p-1.5">
              <button
                onClick={() => setSideCollapsed(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Collapse"
                aria-label="Collapse side panel"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </button>
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  title={t.label}
                  aria-label={t.label}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "flex-1 bg-secondary px-2 text-foreground"
                      : "h-8 w-8 shrink-0 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {active && <span className="truncate">{t.label}</span>}
                  {t.id === "activity" && running && (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
            </div>
          )}
          {!sideCollapsed && (
            <div className="min-h-0 flex-1">
              {tab === "activity" && <ActivityRail entries={activity} running={running} copy={copy} />}
              {tab === "files" && (
                <DocumentsPanel docs={docs} groups={docGroups} onChange={refreshSidebars} copy={copy} />
              )}
              {tab === "memory" && (
                <MemoryPanel
                  memories={memories}
                  glossary={glossary}
                  copy={copy}
                  onDelete={async (id) => {
                    await deleteMemory(id);
                    refreshSidebars();
                  }}
                  onClear={async () => {
                    await clearMemory();
                    refreshSidebars();
                  }}
                />
              )}
              {tab === "jobs" && <JobsPanel jobs={jobs} copy={copy} />}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
