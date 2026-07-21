import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import OutputData from "./pages/OutputData";

const AnalysisSetup = lazy(() => import("./pages/AnalysisSetup"));
const RunAnalysis = lazy(() => import("./pages/RunAnalysis"));
const NoHelmetSetup = lazy(() => import("./pages/NoHelmetSetup"));
const NoSafetyVestSetup = lazy(() => import("./pages/NoSafetyVestSetup"));
const NoLifeVestSetup = lazy(() => import("./pages/NoLifeVestSetup"));
const SafetyRulesSetup = lazy(() => import("./pages/SafetyRulesSetup"));
const WorkingAtHeightSetup = lazy(() => import("./pages/WorkingAtHeightSetup"));
const RedLightViolationSetup = lazy(() => import("./pages/RedLightViolationSetup"));
const DumpTruckBedOpenSetup = lazy(() => import("./pages/DumpTruckBedOpenSetup"));
const HseSafetyRulesRun = lazy(() => import("./pages/HseSafetyRulesRun"));
const NoHelmetAnalysis = lazy(() => import("./pages/NoHelmetAnalysis"));
const LiveMonitoring = lazy(() => import("./pages/LiveMonitoring"));
const Models = lazy(() => import("./pages/Models"));

const queryClient = new QueryClient();

const RouteLoadingFallback = () => (
  <div className="min-h-screen bg-background">
    <main className="ml-16 lg:ml-60 p-6 min-h-screen transition-all duration-300">
      <div role="status" className="rounded-lg border border-border/60 bg-card p-4 text-sm text-muted-foreground">
        Loading route...
      </div>
    </main>
  </div>
);

export const AppRoutes = () => (
  <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Index />} />
      <Route path="/output-data" element={<OutputData />} />
      <Route path="/analysis-setup" element={<AnalysisSetup />} />
      <Route path="/run-analysis" element={<RunAnalysis />} />
      <Route path="/no-helmet-setup" element={<NoHelmetSetup />} />
      <Route path="/no-safety-vest-setup" element={<NoSafetyVestSetup />} />
      <Route path="/no-life-vest-setup" element={<NoLifeVestSetup />} />
      <Route path="/safety-rules-setup" element={<SafetyRulesSetup />} />
      <Route path="/working-at-height-setup" element={<WorkingAtHeightSetup />} />
      <Route path="/red-light-violation-setup" element={<RedLightViolationSetup />} />
      <Route path="/dump-truck-bed-open-setup" element={<DumpTruckBedOpenSetup />} />
      <Route path="/hse-safety-rules-run" element={<HseSafetyRulesRun />} />
      <Route path="/no-helmet-analysis" element={<NoHelmetAnalysis />} />
      <Route path="/live-monitoring" element={<LiveMonitoring />} />
      <Route path="/models" element={<Models />} />
      <Route path="/models/datasets" element={<Models />} />
      <Route path="/models/training-jobs" element={<Models />} />
      <Route path="/models/evaluation" element={<Models />} />
      <Route path="/models/benchmarks" element={<Models />} />
      <Route path="/models/deployment-gate" element={<Models />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/settings" element={<Settings />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppErrorBoundary>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
