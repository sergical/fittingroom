import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTokenSource } from "../src/index.js";
import { tempFile } from "./helpers.js";

describe("TokenSource on CSS in no known dialect", () => {
  const css = "body { color: red; }\n";

  it("read() returns null", () => {
    expect(createTokenSource(tempFile(css)).read()).toBeNull();
  });

  it("write() is refused naming the supported dialects; the file is untouched", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({ "--primary": "blue" });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toContain("shadcn");
      expect(result.reason).toContain("emdash");
    }
    expect(readFileSync(path, "utf8")).toBe(css);
  });
});

describe("TokenSource edit validation", () => {
  const css = ":root {\n  --primary: red;\n}\n.dark {\n  --primary: navy;\n}\n";

  it("refuses an edit value that would inject CSS structure; the file is untouched", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({
      "--primary": "blue; } .evil { color: green",
    });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toContain("--primary");
      expect(result.reason).toContain("not a single declaration value");
    }
    expect(readFileSync(path, "utf8")).toBe(css);
  });

  it("refuses an injecting dark-half edit too", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({
      "--primary": { dark: "navy } body { display: none" },
    });

    expect(result.status).toBe("refused");
    expect(readFileSync(path, "utf8")).toBe(css);
  });
});

describe("TokenSource round-trip refusal", () => {
  // Detected as shadcn (`.dark` rule) but the block is never closed,
  // so the file cannot be parsed — let alone re-serialized byte-identically.
  const css = ":root {\n  --primary: red;\n}\n.dark {\n  --primary: blue;\n";

  it("read() returns null for a file that cannot be parsed", () => {
    expect(createTokenSource(tempFile(css)).read()).toBeNull();
  });

  it("write() to a file that cannot round-trip is refused with diff + reason; the file is untouched", () => {
    const path = tempFile(css);
    const result = createTokenSource(path).write({ "--primary": "green" });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toContain("cannot be parsed");
      expect(typeof result.diff).toBe("string");
    }
    expect(readFileSync(path, "utf8")).toBe(css);
  });
});
