import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

const typeStyles = {
  success: "text-success",
  warning: "text-warning",
  info: "text-primary",
  error: "text-destructive",
};

const typeBadgeStyles = {
  success: "bg-success/20 text-success border-success/30",
  warning: "bg-warning/20 text-warning border-warning/30",
  info: "bg-primary/20 text-primary border-primary/30",
  error: "bg-destructive/20 text-destructive border-destructive/30",
};

export function ActivityLog({ limit }: { limit?: number }) {
  const { data: logData, isLoading, error } = useActivityLogs(limit);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">🕒 AI Activity Log</h3>
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
          <h3 className="font-semibold text-foreground">🕒 AI Activity Log</h3>
        </div>
        <div className="p-4 text-destructive">Failed to load activity logs</div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">🕒 AI Activity Log</h3>
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
              <span className={cn("font-mono text-sm font-semibold", typeStyles[log.result_type])}>
                [{format(new Date(log.timestamp), "HH:mm:ss")}]
              </span>
              <Badge variant="outline" className="bg-secondary/50 border-border text-foreground shrink-0">
                {log.unit_id || "SYSTEM"}
              </Badge>
              <span className="text-foreground">{log.activity}</span>
              <Badge className={cn("ml-auto border shrink-0", typeBadgeStyles[log.result_type])}>
                {log.result}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
