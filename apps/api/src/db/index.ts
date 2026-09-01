export type {
  ApiKeyRecord,
  AssessDb,
  PlanTier,
  UpdateKeyPlanInput,
} from "./types.js";
export { generateApiKeyToken, hashKey as hashApiKey, hashIp } from "../crypto.js";
export { createD1Db } from "./d1.js";
export { createSqliteDb } from "./sqlite.js";

/** @deprecated Use createSqliteDb (tests) or createD1Db (Workers). */
export { createSqliteDb as createDb } from "./sqlite.js";
