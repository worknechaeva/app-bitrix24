import "server-only";

export type Bitrix24TaskEntity = {
  id: string;
  title: string;
  type: "group" | "project" | "scrum";
};

export type Bitrix24Employee = {
  id: string;
  name: string;
  lastName: string;
  middleName?: string;
  position?: string;
  departmentIds: string[];
};

export interface Bitrix24DirectoryClient {
  listTaskEntities(input?: { query?: string }): Promise<Bitrix24TaskEntity[]>;
  listEmployees(input?: { query?: string }): Promise<Bitrix24Employee[]>;
}
