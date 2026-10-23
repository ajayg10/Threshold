import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// A hook after an early return crashed the Door and Demo screens in production (React #310)
// as soon as a visit went from "processing" to "ready". Lint is not run in CI, so the one rule
// that catches it runs here, over every screen and component.
describe("rules of hooks", () => {
  it("holds in app/, components/ and lib/", async () => {
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    const eslint = new ESLint({ cwd, ruleFilter: ({ ruleId }) => ruleId === "react-hooks/rules-of-hooks" });
    const results = await eslint.lintFiles(["app", "components", "lib"]);
    const problems = results.flatMap((r) =>
      r.messages.map((m) => `${r.filePath.slice(cwd.length)}:${m.line} ${m.message}`),
    );
    expect(problems).toEqual([]);
  }, 120_000);
});
