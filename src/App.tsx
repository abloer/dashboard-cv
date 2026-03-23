import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import Index from "./pages/Index";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import OutputData from "./pages/OutputData";
import NoHelmetAnalysis from "./pages/NoHelmetAnalysis";
import AnalysisSetup from "./pages/AnalysisSetup";
import NoHelmetSetup from "./pages/NoHelmetSetup";
import NoSafetyVestSetup from "./pages/NoSafetyVestSetup";
import SafetyRulesSetup from "./pages/SafetyRulesSetup";
import HseSafetyRulesRun from "./pages/HseSafetyRulesRun";
import Models from "./pages/Models";
import LiveMonitoring from "./pages/LiveMonitoring";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppErrorBoundary>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/output-data" element={<OutputData />} />
            <Route path="/analysis-setup" element={<AnalysisSetup />} />
            <Route path="/no-helmet-setup" element={<NoHelmetSetup />} />
            <Route path="/no-safety-vest-setup" element={<NoSafetyVestSetup />} />
            <Route path="/safety-rules-setup" element={<SafetyRulesSetup />} />
            <Route path="/hse-safety-rules-run" element={<HseSafetyRulesRun />} />
            <Route path="/no-helmet-analysis" element={<NoHelmetAnalysis />} />
            <Route path="/live-monitoring" element={<LiveMonitoring />} />
            <Route path="/models" element={<Models />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
