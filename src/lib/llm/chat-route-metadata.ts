import { db } from "@/lib/db";

const keyFor = (messageId: string) => `llm_chat_route_${messageId}`;
export async function saveChatRouteMetadata(messageId: string, metadata: { requestedModel: string; actualRoute?: string; actualProvider?: string; actualModel?: string }) {
  if (!metadata.actualRoute && !metadata.actualProvider && !metadata.actualModel) return;
  await db.setting.upsert({ where: { key: keyFor(messageId) }, create: { key: keyFor(messageId), value: JSON.stringify(metadata) }, update: { value: JSON.stringify(metadata) } });
}
export async function readChatRouteMetadata(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, { requestedModel?: string; actualRoute?: string; actualProvider?: string; actualModel?: string }>();
  const rows = await db.setting.findMany({ where: { key: { in: messageIds.map(keyFor) } } });
  return new Map(rows.flatMap((row) => {
    try { return [[row.key.slice("llm_chat_route_".length), JSON.parse(row.value) as { requestedModel?: string; actualRoute?: string; actualProvider?: string; actualModel?: string }]]; }
    catch { return []; }
  }));
}
export async function deleteChatRouteMetadata() {
  await db.setting.deleteMany({ where: { key: { startsWith: "llm_chat_route_" } } });
}
