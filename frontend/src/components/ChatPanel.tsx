import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Mic, MicOff, Sparkles, Square, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { UiCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  thinking?: boolean;
};

function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        role === "assistant"
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "bg-secondary text-secondary-foreground"
      )}
    >
      {role === "assistant" ? <Sparkles className="h-4 w-4" /> : <User className="h-4 w-4" />}
    </div>
  );
}

export default function ChatPanel({
  messages,
  running,
  onSend,
  onStop,
  copy,
}: {
  messages: ChatMessage[];
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  copy: UiCopy;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit() {
    const t = text.trim();
    if (!t || running) return;
    onSend(t);
    setText("");
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.alert(copy.chat.voiceUnsupported);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = copy.chat.voiceLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      const next = [text, finalText || interimText].filter(Boolean).join(text ? " " : "");
      setText(next.trimStart());
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto mt-16 max-w-xl">
            <h1 className="text-xl font-semibold tracking-tight">
              {copy.chat.welcome} <span className="gradient-text">DocFlow</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              {copy.chat.intro}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {copy.chat.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="rounded-md border bg-background px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <Avatar role={m.role} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {m.role === "assistant" ? "DocFlow" : copy.chat.you}
                </p>
                {m.role === "assistant" ? (
                  <div className={cn("md text-sm", m.streaming && !m.content && "caret")}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    {m.streaming && m.content && <span className="caret" />}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                )}
              </div>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-background/80 p-3 backdrop-blur md:p-4">
        <div className="relative mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={copy.chat.placeholder}
            className="max-h-40 min-h-[40px] flex-1 border-0 shadow-none focus-visible:ring-0"
          />
          {running ? (
            <Button size="icon" variant="secondary" onClick={onStop} title={copy.chat.stop}>
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant={listening ? "secondary" : "ghost"}
                onClick={toggleVoice}
                title={listening ? copy.chat.voiceStop : copy.chat.voiceStart}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button size="icon" onClick={submit} disabled={!text.trim()} title={copy.chat.send}>
                <ArrowUp className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          {copy.chat.enterHint}
        </p>
      </div>
    </div>
  );
}
