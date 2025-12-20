import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "accent" | "warning" | "success";
  className?: string;
}

const variantStyles = {
  default: "bg-card border-border",
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30",
  accent: "bg-gradient-to-br from-accent/20 to-accent/5 border-accent/30",
  warning: "bg-gradient-to-br from-warning/20 to-warning/5 border-warning/30",
  success: "bg-gradient-to-br from-success/20 to-success/5 border-success/30",
};

const iconStyles = {
  default: "bg-secondary text-muted-foreground",
  primary: "bg-primary/20 text-primary",
  accent: "bg-accent/20 text-accent",
  warning: "bg-warning/20 text-warning",
  success: "bg-success/20 text-success",
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300 hover:shadow-lg card-hover overflow-hidden",
        variantStyles[variant],
        className
      )}
    >
      {/* Background decoration */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-gradient-to-br from-primary/5 to-transparent blur-2xl" />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground">vs yesterday</span>
            </div>
          )}
        </div>
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          iconStyles[variant]
        )}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
