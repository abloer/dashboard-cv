import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRoutes } from "@/App";

const apiFixtures: Record<string, unknown> = {
  "/media-sources": { ok: true, items: [] },
  "/dashboard-summary": {
    ok: true,
    summary: {
      totalSources: 0,
      activeSources: 0,
      monitoringSources: 0,
      totalEvents: 0,
      sourceSummaries: [],
      latestAnalysisSummary: null,
    },
  },
  "/models/overview": {
    ok: true,
    overview: {
      totals: {
        datasets: 0,
        readyDatasets: 0,
        draftDatasets: 0,
        trainingJobs: 0,
        runningTrainingJobs: 0,
        modelVersions: 0,
        activeModels: 0,
      },
      domainSplit: { PPE: 0, HSE: 0, Operations: 0 },
      activeModelsByModule: [],
      latestDatasetAt: null,
    },
  },
  "/models/datasets": { ok: true, items: [] },
  "/models/training-jobs": { ok: true, items: [] },
  "/models/versions": { ok: true, items: [] },
  "/models/evaluations": { ok: true, items: [] },
  "/models/benchmarks": { ok: true, items: [] },
};

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;

const installFetchFixture = () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://127.0.0.1:8081");
    const fixture = apiFixtures[url.pathname] ?? { ok: true };
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
};

const suppressExpectedSsrWarnings = () => {
  console.error = (...args: unknown[]) => {
    const message = String(args[0] ?? "");
    if (message.includes("useLayoutEffect does nothing on the server")) {
      return;
    }
    originalConsoleError(...args);
  };
};

const renderRoute = (route: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export const run = async () => {
  installFetchFixture();
  suppressExpectedSsrWarnings();
  try {
    const routes = [
      { path: "/", expected: "Media Sources" },
      { path: "/run-analysis", expected: "Loading route" },
      { path: "/models", expected: "Loading route" },
      { path: "/output-data", expected: "Dashboard" },
    ];

    for (const route of routes) {
      const html = renderRoute(route.path);
      assert.match(html, new RegExp(route.expected), `${route.path} should render ${route.expected}`);
      assert.doesNotMatch(html, /404|Not Found/i, `${route.path} should not render Not Found`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
};
