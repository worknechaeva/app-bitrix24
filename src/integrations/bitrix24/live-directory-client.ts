import "server-only";

import { z } from "zod";
import type { Bitrix24DirectoryClient, Bitrix24Employee, Bitrix24TaskEntity } from "./directory-client";
import { Bitrix24DirectoryError } from "./directory-errors";
import type { Bitrix24HttpResponse, Bitrix24HttpTransport } from "./http-transport";
import { canonicalBitrix24ClientEndpoint } from "./portal-origin";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const MAX_QUERY_LENGTH = 120;
const ID = /^[1-9][0-9]{0,63}$/;

const providerBoolean = z
  .union([z.boolean(), z.enum(["Y", "N"])])
  .transform((value) => value === true || value === "Y");
const providerId = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(ID));
const optionalText = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value?.trim() || undefined);
const pageFields = {
  next: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
};
const providerErrorSchema = z.object({ error: z.string().min(1) }).passthrough();
const modernWorkgroupSchema = z.object({
  id: providerId,
  name: z.string().trim().min(1),
  type: z.enum(["group", "project", "scrum", "collab"]),
  active: providerBoolean,
  closed: providerBoolean,
});
const workgroupPageSchema = z
  .object({ result: z.object({ workgroups: z.array(modernWorkgroupSchema) }), ...pageFields })
  .passthrough();
const legacyGroupSchema = z.object({
  ID: providerId,
  ACTIVE: providerBoolean,
  CLOSED: providerBoolean,
  IS_EXTRANET: providerBoolean,
});
const legacyGroupPageSchema = z.object({ result: z.array(legacyGroupSchema), ...pageFields }).passthrough();
const employeeSchema = z.object({
  ID: providerId,
  ACTIVE: providerBoolean,
  NAME: z.string().trim(),
  LAST_NAME: z.string().trim(),
  SECOND_NAME: optionalText,
  WORK_POSITION: optionalText,
  UF_DEPARTMENT: z.array(providerId).optional().default([]),
  USER_TYPE: z.string().min(1),
});
const employeePageSchema = z.object({ result: z.array(employeeSchema), ...pageFields }).passthrough();
const featureAccessSchema = z.object({ result: z.boolean() }).passthrough();

export type Bitrix24DirectoryCredentials = { accessToken: string; clientEndpoint: string };

export interface Bitrix24DirectoryCredentialProvider {
  resolve(): Promise<Bitrix24DirectoryCredentials>;
}

type Page<T> = { items: T[]; next?: number };

export class LiveBitrix24DirectoryClient implements Bitrix24DirectoryClient {
  constructor(
    private readonly credentialProvider: Bitrix24DirectoryCredentialProvider,
    private readonly transport: Bitrix24HttpTransport,
  ) {}

  async listTaskEntities(input: { query?: string } = {}): Promise<Bitrix24TaskEntity[]> {
    const query = normalizeQuery(input.query);
    const credentials = await this.resolveCredentials();
    const workgroups = await this.fetchAll(
      credentials,
      "socialnetwork.api.workgroup.list",
      (start) => {
        const body = baseBody(credentials.accessToken, start);
        body.set("filter[ACTIVE]", "Y");
        body.set("filter[CLOSED]", "N");
        if (query) body.set("filter[%NAME]", query);
        for (const [index, field] of ["ID", "NAME", "TYPE", "ACTIVE", "CLOSED"].entries()) {
          body.set(`select[${index}]`, field);
        }
        return body;
      },
      parseWorkgroupPage,
    );

    const intranetGroups = await this.fetchAll(
      credentials,
      "sonet_group.get",
      (start) => {
        const body = baseBody(credentials.accessToken, start);
        body.set("FILTER[ACTIVE]", "Y");
        body.set("FILTER[CLOSED]", "N");
        body.set("FILTER[IS_EXTRANET]", "N");
        if (query) body.set("FILTER[%NAME]", query);
        return body;
      },
      parseLegacyGroupPage,
    );
    const intranetIds = new Set(
      intranetGroups
        .filter((group) => group.ACTIVE && !group.CLOSED && !group.IS_EXTRANET)
        .map((group) => group.ID),
    );

    const eligible = workgroups.filter((group) => group.active && !group.closed && intranetIds.has(group.id));
    const result: Bitrix24TaskEntity[] = [];
    for (const group of eligible) {
      if (group.type === "collab") continue;
      const body = new URLSearchParams({
        auth: credentials.accessToken,
        GROUP_ID: group.id,
        FEATURE: "tasks",
        OPERATION: "create_tasks",
      });
      const response = await this.call(credentials, "sonet_group.feature.access", body);
      const parsed = featureAccessSchema.safeParse(response.body);
      if (!parsed.success) throw new Bitrix24DirectoryError("malformed_provider_response");
      if (parsed.data.result) result.push({ id: group.id, title: group.name, type: group.type });
    }
    return result;
  }

  async listEmployees(input: { query?: string } = {}): Promise<Bitrix24Employee[]> {
    const query = normalizeQuery(input.query);
    const credentials = await this.resolveCredentials();
    const method = query ? "user.search" : "user.get";
    const employees = await this.fetchAll(
      credentials,
      method,
      (start) => {
        const body = baseBody(credentials.accessToken, start);
        body.set("SORT", "ID");
        body.set("ORDER", "ASC");
        if (query) {
          body.set("FIND", query);
        } else {
          body.set("FILTER[ACTIVE]", "true");
          body.set("FILTER[USER_TYPE]", "employee");
        }
        return body;
      },
      parseEmployeePage,
    );
    return employees
      .filter((employee) => employee.ACTIVE && employee.USER_TYPE === "employee")
      .map((employee) => ({
        id: employee.ID,
        name: employee.NAME,
        lastName: employee.LAST_NAME,
        ...(employee.SECOND_NAME ? { middleName: employee.SECOND_NAME } : {}),
        ...(employee.WORK_POSITION ? { position: employee.WORK_POSITION } : {}),
        departmentIds: employee.UF_DEPARTMENT,
      }));
  }

  private async fetchAll<T>(
    credentials: Bitrix24DirectoryCredentials,
    method: string,
    createBody: (start: number) => URLSearchParams,
    parsePage: (body: unknown) => Page<T>,
  ): Promise<T[]> {
    const items: T[] = [];
    const seenStarts = new Set<number>();
    const seenIds = new Set<string>();
    let start = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (seenStarts.has(start)) throw new Bitrix24DirectoryError("malformed_provider_response");
      seenStarts.add(start);
      const response = await this.call(credentials, method, createBody(start));
      const parsed = parsePage(response.body);
      for (const item of parsed.items) {
        const id = getItemId(item);
        if (seenIds.has(id)) throw new Bitrix24DirectoryError("malformed_provider_response");
        seenIds.add(id);
        items.push(item);
      }
      if (parsed.next === undefined) return items;
      if (parsed.next <= start || parsed.next % PAGE_SIZE !== 0) {
        throw new Bitrix24DirectoryError("malformed_provider_response");
      }
      start = parsed.next;
    }
    throw new Bitrix24DirectoryError("unsupported_provider_contract");
  }

  private async resolveCredentials(): Promise<Bitrix24DirectoryCredentials> {
    try {
      const credentials = await this.credentialProvider.resolve();
      return {
        accessToken: credentials.accessToken,
        clientEndpoint: canonicalBitrix24ClientEndpoint(credentials.clientEndpoint),
      };
    } catch (error) {
      if (error instanceof Bitrix24DirectoryError) throw error;
      throw new Bitrix24DirectoryError("credentials_unavailable");
    }
  }

  private async call(
    credentials: Bitrix24DirectoryCredentials,
    method: string,
    body: URLSearchParams,
  ): Promise<Bitrix24HttpResponse> {
    let response: Bitrix24HttpResponse;
    try {
      response = await this.transport.postForm(new URL(method, credentials.clientEndpoint), body);
    } catch {
      throw new Bitrix24DirectoryError("provider_unavailable");
    }
    if (response.status === 401) throw new Bitrix24DirectoryError("unauthorized");
    if (response.status === 403) throw new Bitrix24DirectoryError("permission_denied");
    if (!response.ok) throw new Bitrix24DirectoryError("provider_unavailable");
    const providerError = providerErrorSchema.safeParse(response.body);
    if (providerError.success) {
      const code = providerError.data.error;
      if (code === "expired_token" || code === "NO_AUTH_FOUND") {
        throw new Bitrix24DirectoryError("unauthorized");
      }
      if (["insufficient_scope", "ACCESS_DENIED", "INVALID_CREDENTIALS"].includes(code)) {
        throw new Bitrix24DirectoryError("permission_denied");
      }
      throw new Bitrix24DirectoryError("provider_unavailable");
    }
    return response;
  }
}

function baseBody(accessToken: string, start: number): URLSearchParams {
  return new URLSearchParams({ auth: accessToken, start: String(start) });
}

function normalizeQuery(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const query = value.trim();
  if (!query) return undefined;
  if (query.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new Bitrix24DirectoryError("unsupported_provider_contract");
  }
  return query;
}

function getItemId(item: unknown): string {
  if (typeof item !== "object" || item === null) {
    throw new Bitrix24DirectoryError("malformed_provider_response");
  }
  const value = "id" in item ? item.id : "ID" in item ? item.ID : undefined;
  if (typeof value !== "string" || !ID.test(value)) {
    throw new Bitrix24DirectoryError("malformed_provider_response");
  }
  return value;
}

function parseWorkgroupPage(body: unknown): Page<z.infer<typeof modernWorkgroupSchema>> {
  const parsed = workgroupPageSchema.safeParse(body);
  if (!parsed.success) throw new Bitrix24DirectoryError("malformed_provider_response");
  return { items: parsed.data.result.workgroups, next: parsed.data.next };
}

function parseLegacyGroupPage(body: unknown): Page<z.infer<typeof legacyGroupSchema>> {
  const parsed = legacyGroupPageSchema.safeParse(body);
  if (!parsed.success) throw new Bitrix24DirectoryError("malformed_provider_response");
  return { items: parsed.data.result, next: parsed.data.next };
}

function parseEmployeePage(body: unknown): Page<z.infer<typeof employeeSchema>> {
  const parsed = employeePageSchema.safeParse(body);
  if (!parsed.success) throw new Bitrix24DirectoryError("malformed_provider_response");
  return { items: parsed.data.result, next: parsed.data.next };
}
