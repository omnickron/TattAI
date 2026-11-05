/** Result of a server action; `warning` = saved, but with a hint shown in amber. */
export type ActionState = { ok: boolean; message: string; warning?: boolean } | null;
