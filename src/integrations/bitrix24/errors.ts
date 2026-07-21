export type Bitrix24ErrorCode = "BITRIX_UNAVAILABLE" | "BITRIX_TIMEOUT";

export class Bitrix24Error extends Error {
  constructor(
    public readonly code: Bitrix24ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "Bitrix24Error";
  }
}
