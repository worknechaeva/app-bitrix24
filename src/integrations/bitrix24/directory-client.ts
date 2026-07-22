import "server-only";

export type Bitrix24TaskEntity = {
  id: string;
  name: string;
  type: "group" | "project" | "scrum";
  active: boolean;
  closed: boolean;
  collab: boolean;
  extranetEnabled: boolean;
  canCreateTasks: boolean;
};

export type Bitrix24Employee = {
  id: string;
  name: string;
  lastName: string;
  middleName?: string;
  position?: string;
  departmentIds: string[];
  active: boolean;
  userType: string;
};

export type Bitrix24DirectoryPage<T> = {
  items: T[];
  nextCursor?: string;
};

export interface Bitrix24DirectoryClient {
  searchTaskEntities(input: {
    query?: string;
    cursor?: string;
  }): Promise<Bitrix24DirectoryPage<Bitrix24TaskEntity>>;
  searchActiveEmployees(input: {
    query?: string;
    cursor?: string;
  }): Promise<Bitrix24DirectoryPage<Bitrix24Employee>>;
}
