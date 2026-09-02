import { describe, expect, it } from "vitest";
import type { Bitrix24HttpResponse, Bitrix24HttpTransport } from "@/integrations/bitrix24/http-transport";
import { Bitrix24DirectoryError } from "@/integrations/bitrix24/directory-errors";
import {
  LiveBitrix24DirectoryClient,
  type Bitrix24DirectoryCredentialProvider,
} from "@/integrations/bitrix24/live-directory-client";

const credentials: Bitrix24DirectoryCredentialProvider = {
  async resolve() {
    return { accessToken: "secret-access", clientEndpoint: "https://portal.example/rest/" };
  },
};

class QueueTransport implements Bitrix24HttpTransport {
  calls: Array<{ method: string; body: URLSearchParams }> = [];
  constructor(private readonly responses: Bitrix24HttpResponse[]) {}
  async postForm(url: URL, body: URLSearchParams): Promise<Bitrix24HttpResponse> {
    this.calls.push({ method: url.pathname.replace("/rest/", ""), body: new URLSearchParams(body) });
    const response = this.responses.shift();
    if (!response) throw new Error("missing fake response");
    return response;
  }
}

const ok = (body: unknown): Bitrix24HttpResponse => ({ ok: true, status: 200, body });
const workgroup = (id: string, type: "group" | "project" | "scrum" | "collab", extra = {}) => ({
  id,
  name: `Entity ${id}`,
  type,
  active: true,
  closed: false,
  ...extra,
});
const legacy = (id: string, extra = {}) => ({
  ID: id,
  ACTIVE: "Y",
  CLOSED: "N",
  IS_EXTRANET: "N",
  ...extra,
});
const employee = (id: string, extra = {}) => ({
  ID: id,
  ACTIVE: true,
  NAME: `Name${id}`,
  LAST_NAME: `Last${id}`,
  SECOND_NAME: "",
  WORK_POSITION: "Developer",
  UF_DEPARTMENT: [1],
  USER_TYPE: "employee",
  ...extra,
});

describe("LiveBitrix24DirectoryClient entity directory", () => {
  it("returns task-capable groups, projects and Scrum while excluding collab, extranet and closed entities", async () => {
    const transport = new QueueTransport([
      ok({
        result: {
          workgroups: [
            workgroup("1", "group"),
            workgroup("2", "project"),
            workgroup("3", "scrum"),
            workgroup("4", "collab"),
            workgroup("5", "group"),
            workgroup("6", "project", { closed: true }),
          ],
        },
      }),
      ok({ result: [legacy("1"), legacy("2"), legacy("3"), legacy("5", { IS_EXTRANET: "Y" })] }),
      ok({ result: true }),
      ok({ result: false }),
      ok({ result: true }),
    ]);
    const result = await new LiveBitrix24DirectoryClient(credentials, transport).listTaskEntities();
    expect(result).toEqual([
      { id: "1", title: "Entity 1", type: "group" },
      { id: "3", title: "Entity 3", type: "scrum" },
    ]);
    expect(transport.calls.map((call) => call.method)).toEqual([
      "socialnetwork.api.workgroup.list",
      "sonet_group.get",
      "sonet_group.feature.access",
      "sonet_group.feature.access",
      "sonet_group.feature.access",
    ]);
    expect(transport.calls[2]?.body.get("OPERATION")).toBe("create_tasks");
    expect(JSON.stringify(result)).not.toContain("secret-access");
  });

  it("follows provider pagination and rejects duplicated entities", async () => {
    const transport = new QueueTransport([
      ok({ result: { workgroups: [workgroup("1", "group")] }, next: 50 }),
      ok({ result: { workgroups: [workgroup("2", "project")] } }),
      ok({ result: [legacy("1")], next: 50 }),
      ok({ result: [legacy("2")] }),
      ok({ result: true }),
      ok({ result: true }),
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, transport).listTaskEntities(),
    ).resolves.toHaveLength(2);
    expect(transport.calls.slice(0, 2).map((call) => call.body.get("start"))).toEqual(["0", "50"]);

    const duplicate = new QueueTransport([
      ok({ result: { workgroups: [workgroup("1", "group")] }, next: 50 }),
      ok({ result: { workgroups: [workgroup("1", "group")] } }),
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, duplicate).listTaskEntities(),
    ).rejects.toMatchObject({ code: "malformed_provider_response" });
  });

  it("fails closed for malformed cursors and a provider error after the first page", async () => {
    const malformed = new QueueTransport([
      ok({ result: { workgroups: [workgroup("1", "group")] }, next: 1 }),
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, malformed).listTaskEntities(),
    ).rejects.toMatchObject({ code: "malformed_provider_response" });

    const denied = new QueueTransport([
      ok({ result: { workgroups: [workgroup("1", "group")] }, next: 50 }),
      ok({ error: "insufficient_scope" }),
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, denied).listTaskEntities(),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });
});

describe("LiveBitrix24DirectoryClient employee directory", () => {
  it("returns only active employees across pages and keeps the DTO minimal", async () => {
    const transport = new QueueTransport([
      ok({
        result: [
          employee("1"),
          employee("2", { ACTIVE: false }),
          employee("3", { USER_TYPE: "extranet" }),
          employee("4", { USER_TYPE: "email" }),
        ],
        next: 50,
      }),
      ok({ result: [employee("5", { SECOND_NAME: "Middle", UF_DEPARTMENT: [2, "3"] })] }),
    ]);
    const result = await new LiveBitrix24DirectoryClient(credentials, transport).listEmployees();
    expect(result).toEqual([
      {
        id: "1",
        name: "Name1",
        lastName: "Last1",
        position: "Developer",
        departmentIds: ["1"],
      },
      {
        id: "5",
        name: "Name5",
        lastName: "Last5",
        middleName: "Middle",
        position: "Developer",
        departmentIds: ["2", "3"],
      },
    ]);
    expect(transport.calls.map((call) => call.method)).toEqual(["user.get", "user.get"]);
  });

  it("uses user.search for a query and maps permission and malformed response errors", async () => {
    const search = new QueueTransport([ok({ result: [employee("1")] })]);
    await new LiveBitrix24DirectoryClient(credentials, search).listEmployees({ query: "Name" });
    expect(search.calls[0]?.method).toBe("user.search");
    expect(search.calls[0]?.body.get("FIND")).toBe("Name");
    expect(search.calls[0]?.body.has("FILTER[USER_TYPE]")).toBe(false);

    await expect(
      new LiveBitrix24DirectoryClient(
        credentials,
        new QueueTransport([{ ok: false, status: 403, body: null }]),
      ).listEmployees(),
    ).rejects.toMatchObject({ code: "permission_denied" });
    await expect(
      new LiveBitrix24DirectoryClient(
        credentials,
        new QueueTransport([ok({ result: [{ ID: "bad" }] })]),
      ).listEmployees(),
    ).rejects.toMatchObject({ code: "malformed_provider_response" });
  });

  it("rejects duplicate employees and provider failure on a later page", async () => {
    const duplicate = new QueueTransport([
      ok({ result: [employee("1")], next: 50 }),
      ok({ result: [employee("1")] }),
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, duplicate).listEmployees(),
    ).rejects.toMatchObject({ code: "malformed_provider_response" });

    const unavailable = new QueueTransport([
      ok({ result: [employee("1")], next: 50 }),
      { ok: false, status: 503, body: null },
    ]);
    await expect(
      new LiveBitrix24DirectoryClient(credentials, unavailable).listEmployees(),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("normalizes credential failures without exposing their cause", async () => {
    const client = new LiveBitrix24DirectoryClient(
      {
        async resolve() {
          throw new Error("contains secret");
        },
      },
      new QueueTransport([]),
    );
    await expect(client.listEmployees()).rejects.toEqual(
      new Bitrix24DirectoryError("credentials_unavailable"),
    );
  });
});
