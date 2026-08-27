import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { JobItem } from "@/lib/api";
import type { UiCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function icon(status: JobItem["status"]) {
  if (status === "done") return CheckCircle2;
  if (status === "error") return XCircle;
  return Clock3;
}

export default function JobsPanel({ jobs, copy }: { jobs: JobItem[]; copy: UiCopy }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Clock3 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{copy.jobs.title}</h2>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {jobs.map((job) => {
          const Icon = icon(job.status);
          return (
            <div key={job.id} className="rounded-md border bg-card p-2.5">
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    job.status === "done" && "text-emerald-600",
                    job.status === "error" && "text-red-500",
                    job.status === "running" && "text-primary"
                  )}
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{job.prompt}</p>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{copy.jobs[job.status]}</span>
                <span>{new Date(job.started_at).toLocaleString()}</span>
              </div>
              {job.outputs?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {job.outputs.map((out) => (
                    <a key={out} href={out} className="block truncate text-[10px] text-primary underline">
                      {out.split("/").pop()}
                    </a>
                  ))}
                </div>
              )}
              {job.error && <p className="mt-1 line-clamp-2 text-[10px] text-red-500">{job.error}</p>}
            </div>
          );
        })}
        {jobs.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">{copy.jobs.empty}</p>
        )}
      </div>
    </div>
  );
}
