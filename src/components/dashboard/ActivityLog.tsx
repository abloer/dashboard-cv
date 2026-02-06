import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { Skeleton } from "@/components/ui/skeleton";

export function ActivityLog({ limit }: { limit?: number }) {
  const { data: logData, isLoading, error } = useActivityLogs(limit);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">🧾 Analytic Log</h3>
          <Badge variant="outline" className="bg-secondary/50 border-border text-muted-foreground">
            Live
          </Badge>
        </div>
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">🧾 Analytic Log</h3>
        </div>
        <div className="p-4 text-destructive">Failed to load analytics</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">🧾 Analytic Log</h3>
        <Badge variant="outline" className="bg-secondary/50 border-border text-muted-foreground">
          Live
        </Badge>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <div className="divide-y divide-border">
          {logData?.map((log, index) => (
            <div 
              key={log.id} 
              className={cn(
                "px-4 py-3 hover:bg-secondary/30 transition-colors flex items-center gap-4",
                "animate-fade-in opacity-0",
                `stagger-${Math.min(index + 1, 8)}`
              )}
              style={{ animationFillMode: "forwards" }}
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0">
                #{log.id}
              </span>
              <Badge variant="outline" className="bg-secondary/50 border-border text-foreground shrink-0">
                {log.analyticType || "UNKNOWN"}
              </Badge>
              <span className="text-foreground">
                {log.fileName || "Unnamed Video"}
                {log.location ? ` • ${log.location}` : ""}
                {log.operator ? ` • ${log.operator}` : ""}
              </span>
              <Badge className="ml-auto border shrink-0 bg-primary/10 text-primary">
                {log.avgCycleTime ? `${log.avgCycleTime}s` : log.benchHeight ? `${log.benchHeight}m` : log.frontLoadingAreaLength ? `${log.frontLoadingAreaLength}m` : "-"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
