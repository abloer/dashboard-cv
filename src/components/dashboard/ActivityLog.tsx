import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  id: string;
  timestamp: string;
  unit: string;
  activity: string;
  result: string;
  type: "success" | "warning" | "info" | "error";
}

const logData: LogEntry[] = [
  { id: "1", timestamp: "08:45:10", unit: "EX-03", activity: "Loading Material", result: "Efisiensi 93%", type: "success" },
  { id: "2", timestamp: "08:44:55", unit: "EX-02", activity: "Idle Start", result: "Awaiting truck", type: "warning" },
  { id: "3", timestamp: "08:44:20", unit: "DT-07", activity: "Dumping", result: "Completed", type: "success" },
  { id: "4", timestamp: "08:43:30", unit: "EX-01", activity: "Swinging", result: "Normal", type: "info" },
  { id: "5", timestamp: "08:42:15", unit: "EX-05", activity: "Hydraulic Alert", result: "Pressure Drop", type: "error" },
  { id: "6", timestamp: "08:41:00", unit: "EX-04", activity: "Digging", result: "Depth Optimal", type: "success" },
  { id: "7", timestamp: "08:40:45", unit: "DT-06", activity: "Loading", result: "Speed Good", type: "success" },
  { id: "8", timestamp: "08:39:20", unit: "EX-08", activity: "Cycle Complete", result: "78 seconds", type: "info" },
  { id: "9", timestamp: "08:38:10", unit: "EX-03", activity: "Dumping to DT-07", result: "Position Safe", type: "success" },
  { id: "10", timestamp: "08:37:00", unit: "EX-01", activity: "AI Calibration", result: "Auto-adjusted", type: "info" },
];

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
  const data = limit ? logData.slice(0, limit) : logData;

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
          {data.map((log, index) => (
            <div 
              key={log.id} 
              className={cn(
                "px-4 py-3 hover:bg-secondary/30 transition-colors flex items-center gap-4",
                "animate-fade-in opacity-0",
                `stagger-${Math.min(index + 1, 8)}`
              )}
              style={{ animationFillMode: "forwards" }}
            >
              <span className={cn("font-mono text-sm font-semibold", typeStyles[log.type])}>
                [{log.timestamp}]
              </span>
              <Badge variant="outline" className="bg-secondary/50 border-border text-foreground shrink-0">
                {log.unit}
              </Badge>
              <span className="text-foreground">{log.activity}</span>
              <Badge className={cn("ml-auto border shrink-0", typeBadgeStyles[log.type])}>
                {log.result}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
