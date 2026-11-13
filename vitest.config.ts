import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests don't start the Cloudflare plugin.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
