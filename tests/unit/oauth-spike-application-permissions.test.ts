import { describe, expect, it } from "vitest";
import {
  validateOAuthSpikePermissions,
  verifyOAuthSpikePermissionHypothesis,
} from "@/integrations/bitrix24/spike/application-permissions";

describe("OAuth spike application permissions", () => {
  it.each([
    [["user_brief"], ["user_brief"]],
    [
      ["app", "user_brief"],
      ["app", "user_brief"],
    ],
    [
      [" user_brief ", "app", "user_brief"],
      ["app", "user_brief"],
    ],
  ])("normalizes and accepts the exact permission hypothesis", (permissions, expected) => {
    expect(verifyOAuthSpikePermissionHypothesis(permissions, "user_brief")).toEqual(expected);
  });

  it.each([[["user"]], [["app"]], [["basic"]], [["USER_BRIEF"]]])(
    "rejects permissions without the exact user_brief hypothesis: %s",
    (permissions) => {
      expect(() => verifyOAuthSpikePermissionHypothesis(permissions, "user_brief")).toThrowError(
        expect.objectContaining({ reasonCode: "permission_hypothesis_mismatch" }),
      );
    },
  );

  it.each([
    [[]],
    [["unsafe=value"]],
    [["x".repeat(65)]],
    [Array.from({ length: 33 }, (_, index) => `permission_${index}`)],
  ])("rejects malformed or excessive permission metadata", (permissions) => {
    expect(() => validateOAuthSpikePermissions(permissions)).toThrowError(
      expect.objectContaining({ reasonCode: "provider_unavailable" }),
    );
  });
});
