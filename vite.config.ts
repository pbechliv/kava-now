import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.min.*",
      "**/drizzle/meta/**",
      "pnpm-lock.yaml",
    ],
  },
  lint: {
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/*.config.*"],
    options: { typeAware: true, typeCheck: true },
  },
});
