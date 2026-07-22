import "server-only";

export type CreateBitrixTaskInput = {
  idempotencyKey: string;
  title: string;
  description?: string;
  responsibleId: string;
  groupId: string;
  deadline?: string;
  tags: string[];
};

export type CreateBitrixTaskResult =
  | {
      status: "success";
      task: {
        id: string;
        title: string;
        responsibleId: string;
        deadline?: string;
        url?: string;
      };
    }
  | {
      status: "error";
      code: "task_creation_disabled";
    };

export interface Bitrix24TaskClient {
  createTask(input: CreateBitrixTaskInput): Promise<CreateBitrixTaskResult>;
}
