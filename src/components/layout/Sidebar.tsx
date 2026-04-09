import { Link, useLocation } from "react-router-dom";
import {
  Brain,
  Boxes,
  FileText,
  Settings,
  LayoutDashboard,
  Monitor,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  ShieldAlert,
  HardHat,
  ShieldCheck,
  Database,
  FlaskConical,
  TrafficCone,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const topLevelNavigation = [
  { name: "Media Sources", href: "/", icon: ClipboardList },
  { name: "Dashboard", href: "/output-data", icon: LayoutDashboard },
  { name: "Live Monitoring", href: "/live-monitoring", icon: Monitor },
  { name: "Analysis Setup", href: "/analysis-setup", icon: Brain },
  { name: "Models", href: "/models", icon: Boxes },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

const analyticsNavigation = [
  { name: "PPE • No Helmet Setup", href: "/no-helmet-setup", icon: HardHat },
  { name: "PPE • No Safety Vest Setup", href: "/no-safety-vest-setup", icon: HardHat },
  { name: "PPE • No Life Vest Setup", href: "/no-life-vest-setup", icon: HardHat },
  { name: "HSE • Safety Rules Setup", href: "/safety-rules-setup", icon: ShieldCheck },
  { name: "HSE • Working at Height Setup", href: "/working-at-height-setup", icon: ShieldAlert },
  { name: "Operations • Red Light Setup", href: "/red-light-violation-setup", icon: TrafficCone },
  { name: "Operations • Dump Truck Setup", href: "/dump-truck-bed-open-setup", icon: Truck },
];

const modelsNavigation = [
  { name: "Models Overview", href: "/models", icon: Boxes },
  { name: "Dataset Registry", href: "/models/datasets", icon: Database },
  { name: "Training Jobs", href: "/models/training-jobs", icon: Brain },
  { name: "Evaluation", href: "/models/evaluation", icon: FlaskConical },
  { name: "Benchmark", href: "/models/benchmarks", icon: FlaskConical },
  { name: "Deployment Gate", href: "/models/deployment-gate", icon: ShieldCheck },
];

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const isAnalyticsActive = analyticsNavigation.some((item) => item.href === location.pathname);
  const isModelsActive = modelsNavigation.some((item) => item.href === location.pathname);
  const [analyticsOpen, setAnalyticsOpen] = useState(isAnalyticsActive);
  const [modelsOpen, setModelsOpen] = useState(isModelsActive);

  useEffect(() => {
    if (isAnalyticsActive) {
      setAnalyticsOpen(true);
    }
  }, [isAnalyticsActive]);

  useEffect(() => {
    if (isModelsActive) {
      setModelsOpen(true);
    }
  }, [isModelsActive]);

  const renderNavLink = (
    item: { name: string; href: string; icon: typeof Brain },
    options?: { nested?: boolean }
  ) => {
    const isActive = location.pathname === item.href;
    return (
      <Link
        key={item.name}
        to={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg transition-all duration-200 group",
          options?.nested ? "px-3 py-2 ml-3" : "px-3 py-2.5",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon
          className={cn(
            "w-5 h-5 shrink-0 transition-colors",
            isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-primary"
          )}
        />
        {!collapsed && (
          <span className="text-sm font-medium whitespace-nowrap animate-fade-in">
            {item.name}
          </span>
        )}
        {isActive && !collapsed && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
        )}
      </Link>
    );
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-full z-50 flex flex-col transition-all duration-300 ease-in-out",
        "bg-sidebar border-r border-sidebar-border",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-sidebar-accent-foreground whitespace-nowrap">
                Dig Vision
              </h1>
              <p className="text-[10px] text-sidebar-foreground whitespace-nowrap">
                Fleet Analytics
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {topLevelNavigation.slice(0, 4).map((item) => renderNavLink(item))}

        <div className="pt-2">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
              Modules
            </p>
          )}
          <button
            type="button"
            onClick={() => setAnalyticsOpen((current) => !current)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200",
              isAnalyticsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <ShieldAlert className={cn("w-5 h-5 shrink-0", isAnalyticsActive ? "text-primary" : "text-sidebar-foreground")} />
            {!collapsed && (
              <>
                <span className="text-sm font-medium whitespace-nowrap animate-fade-in">Analysis Modules</span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform duration-200",
                    analyticsOpen ? "rotate-180" : ""
                  )}
                />
              </>
            )}
          </button>

          {!collapsed && analyticsOpen && (
            <div className="mt-1 space-y-1">
              {analyticsNavigation.map((item) => renderNavLink(item, { nested: true }))}
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => setModelsOpen((current) => !current)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200",
              isModelsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <Boxes className={cn("w-5 h-5 shrink-0", isModelsActive ? "text-primary" : "text-sidebar-foreground")} />
            {!collapsed && (
              <>
                <span className="text-sm font-medium whitespace-nowrap animate-fade-in">Models</span>
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform duration-200",
                    modelsOpen ? "rotate-180" : ""
                  )}
                />
              </>
            )}
          </button>

          {!collapsed && modelsOpen && (
            <div className="mt-1 space-y-1">
              {modelsNavigation.map((item) => renderNavLink(item, { nested: true }))}
            </div>
          )}
        </div>

        <div className="pt-2 space-y-1">
          {topLevelNavigation.slice(5).map((item) => renderNavLink(item))}
        </div>
      </nav>

      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Footer */}
      <div className={cn(
        "p-4 border-t border-sidebar-border",
        collapsed ? "text-center" : ""
      )}>
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/60 animate-fade-in">
            © 2025
          </p>
        )}
      </div>
    </aside>
  );
}
