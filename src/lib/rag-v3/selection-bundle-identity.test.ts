import { describe, expect, it } from "vitest";
import { selectionBundleDatasetIdentityMatches } from "./composite-index";

describe("value-selection bundle dataset identity", () => {
  it("keeps the frozen dataset version distinct from the retrieval source revision", () => {
    expect(selectionBundleDatasetIdentityMatches({
      bundleDatasetVersion: "cg-v1-6c36cee81a61",
      activeDatasetVersion: "cg-v1-6c36cee81a61",
      retrievalDatasetVersion: "source-revision-sha256",
      retrievalSourceRevision: "source-revision-sha256",
    })).toBe(true);
  });

  it("rejects a bundle that does not match the active dataset pointer", () => {
    expect(selectionBundleDatasetIdentityMatches({
      bundleDatasetVersion: "cg-v1-old",
      activeDatasetVersion: "cg-v1-current",
      retrievalDatasetVersion: "source-revision-sha256",
      retrievalSourceRevision: "source-revision-sha256",
    })).toBe(false);
  });

  it("rejects a retrieval index whose dataset marker does not match its source revision", () => {
    expect(selectionBundleDatasetIdentityMatches({
      bundleDatasetVersion: "cg-v1-current",
      activeDatasetVersion: "cg-v1-current",
      retrievalDatasetVersion: "cg-v1-current",
      retrievalSourceRevision: "source-revision-sha256",
    })).toBe(false);
  });
});
