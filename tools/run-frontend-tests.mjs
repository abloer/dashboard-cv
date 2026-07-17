import { createLogger, createServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://frontend-test.supabase.co";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "frontend-test-publishable-key";

const testModules = [
  "/src/test/frontendRouteSmoke.test.tsx",
  "/src/test/libNormalizers.test.ts",
];

const logger = createLogger("error", { prefix: "[frontend-test]" });
const logError = logger.error;
logger.error = (message, options) => {
  if (String(message).includes("WebSocket server error")) {
    return;
  }
  logError(message, options);
};

const server = await createServer({
  appType: "custom",
  customLogger: logger,
  logLevel: "error",
  server: {
    hmr: false,
    middlewareMode: true,
  },
});

try {
  for (const modulePath of testModules) {
    const testModule = await server.ssrLoadModule(modulePath);
    await testModule.run();
  }
} finally {
  await server.close();
}
