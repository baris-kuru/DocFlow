export type AgentEvent =
  | { type: "token"; content: string }
  | { type: "tool_start"; name: string; args?: Record<string, unknown> }
  | { type: "tool_end"; name: string; content: string }
  | { type: "progress"; content: string }
  | { type: "done" }
  | { type: "error"; content: string };

export interface DocItem {
  name: string;
  size: number;
  ext: string;
  url?: string;
  role?: "input" | "output";
  group?: string;
  doc_type?: string;
  status?: string;
}

export interface DocumentWorkspace {
  documents: DocItem[];
  groups: string[];
}

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  memory_type: string;
  entity: string | null;
  tags: string;
  created_at: string;
}

export interface GlossaryItem {
  id: string;
  source: string;
  target: string;
  source_language: string;
  target_language: string;
  context: string;
}

export interface JobItem {
  id: string;
  prompt: string;
  status: "running" | "done" | "error";
  outputs: string[];
  error: string;
  started_at: string;
  finished_at: string | null;
}

export async function health() {
  const r = await fetch("/api/health");
  return r.json() as Promise<{ status: string; model: string; fireworks_key: boolean }>;
}

export async function listDocuments(): Promise<DocItem[]> {
  const r = await fetch("/api/documents");
  const j = await r.json();
  return j.documents ?? [];
}

export async function listDocumentWorkspace(): Promise<DocumentWorkspace> {
  const r = await fetch("/api/documents");
  const j = await r.json();
  return { documents: j.documents ?? [], groups: j.groups ?? ["Inputs", "Outputs"] };
}

export async function uploadFile(file: File): Promise<DocItem> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  return r.json();
}

export async function deleteDocument(name: string): Promise<void> {
  await fetch(`/api/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function clearDocuments(): Promise<void> {
  await fetch("/api/documents", { method: "DELETE" });
}

export async function consolidateDocuments(): Promise<{ updated: number }> {
  const r = await fetch("/api/documents/consolidate", { method: "POST" });
  return r.json();
}

export async function createDocumentGroup(name: string): Promise<string[]> {
  const r = await fetch("/api/document-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const j = await r.json();
  return j.groups ?? [];
}

export async function deleteDocumentGroup(name: string): Promise<void> {
  await fetch(`/api/document-groups/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export async function updateDocument(
  name: string,
  patch: { group?: string; role?: "input" | "output"; doc_type?: string; status?: string }
): Promise<void> {
  await fetch(`/api/documents/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function listMemory(userId = "default"): Promise<MemoryItem[]> {
  const r = await fetch(`/api/memory?user_id=${encodeURIComponent(userId)}`);
  const j = await r.json();
  return j.memories ?? [];
}

export async function deleteMemory(id: string, userId = "default"): Promise<void> {
  await fetch(`/api/memory/${encodeURIComponent(id)}?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function clearMemory(userId = "default"): Promise<void> {
  await fetch(`/api/memory?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function listGlossary(userId = "default"): Promise<GlossaryItem[]> {
  const r = await fetch(`/api/glossary?user_id=${encodeURIComponent(userId)}`);
  const j = await r.json();
  return j.glossary ?? [];
}

export async function listJobs(userId = "default"): Promise<JobItem[]> {
  const r = await fetch(`/api/jobs?user_id=${encodeURIComponent(userId)}`);
  const j = await r.json();
  return j.jobs ?? [];
}

export interface ChatParams {
  message: string;
  threadId: string;
  userId?: string;
  sessionId?: string;
}

/** Stream the agent run, calling onEvent for each parsed SSE event. */
export async function streamChat(
  params: ChatParams,
  onEvent: (e: AgentEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      thread_id: params.threadId,
      user_id: params.userId ?? "default",
      session_id: params.sessionId ?? "default",
    }),
    signal,
  });
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload) as AgentEvent);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
