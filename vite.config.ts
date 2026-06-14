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
    // Forbid TS non-null assertions (`!`). tsconfig can't express this; the
    // linter is the enforcement point. Use optional chaining, a guard, or the
    // context.ts / test-utils.ts helpers instead.
    rules: { "typescript/no-non-null-assertion": "error" },
  },
});
