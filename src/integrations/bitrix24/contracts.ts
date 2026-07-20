export type TaskPriority = "low" | "medium" | "high";

export type ConnectionStatus = {
  connected: boolean;
  mode: "mock" | "live";
  accountName: string;
  checkedAt: string;
};

export type BitrixUser = {
  id: string;
  name: string;
  position?: string;
  active: boolean;
};

export type BitrixWorkgroup = {
  id: string;
  name: string;
  active: boolean;
};

export type CreateBitrixTaskInput = {
  idempotencyKey: string;
  title: string;
  description?: string;
  responsibleId: string;
  groupId: string;
  deadline?: string;
  priority: TaskPriority;
  estimateSeconds?: number;
  tags: string[];
  allowTimeTracking: boolean;
};

export type CreateBitrixTaskResult = {
  id: string;
  title: string;
  responsibleId: string;
  deadline?: string;
  url?: string;
};

export interface Bitrix24Client {
  checkConnection(): Promise<ConnectionStatus>;
  getCurrentUser(): Promise<BitrixUser>;
  listEmployees(): Promise<BitrixUser[]>;
  listWorkgroups(): Promise<BitrixWorkgroup[]>;
  createTask(input: CreateBitrixTaskInput): Promise<CreateBitrixTaskResult>;
}
