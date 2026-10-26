import { describe, expect, it } from "vitest";
import { parseIssue } from "../adapters/user-submission";
import { NOW } from "./helpers";

describe("user-submission adapter", () => {
  it("parses the JSON block from an issue body", () => {
    const body = "New place suggestion.\n\n```json\n" + JSON.stringify({ kind: "new", name: "Hale Pele", city: "Portland", region: "Oregon", country: "United States", website: "halepele.com", status: "open" }) + "\n```\n";
    const o = parseIssue({ number: 12, html_url: "https://github.com/x/y/issues/12", body, state: "open" }, "user-submission", NOW.toISOString());
    expect(o).toMatchObject({ sourceRef: "issue-12", name: "Hale Pele", address: { locality: "Portland", region: "Oregon", country: "US" }, website: "https://halepele.com/", statusHint: "open", tags: ["tiki-directory"] });
    expect(parseIssue({ number: 1, html_url: "u", body: "no json here", state: "open" }, "user-submission", NOW.toISOString())).toBeNull();
  });
});
