/* =============================================================================
 * ⚠️  STUB: Crystal API Distributed Sync Adapter
 * =============================================================================
 *
 * ЗАГЛУШКА. Замените на реальный distributed storage:
 *
 *   Вариант A — Redis:
 *     import { createClient } from "redis"
 *     const client = createClient({ url: "redis://crystal-cluster:6379" })
 *     await client.hSet(`crystal:${id}`, { nodes: JSON.stringify(...), M, S })
 *
 *   Вариант B — PostgreSQL + JSONB:
 *     CREATE TABLE crystals (
 *       crystal_id TEXT PRIMARY KEY,
 *       nodes JSONB NOT NULL,
 *       matrix BYTEA,
 *       updated_at TIMESTAMPTZ
 *     );
 *
 *   Вариант C — FoundationDB / etcd (для strict consistency):
 *     key = `/crystals/${crystal_id}`
 *     value = serialized crystal snapshot
 *
 * Текущая реализация: in-memory Map. Переживает HTTP-запросы в рамках
 * одного процесса Next.js dev server, но теряется при рестарте.
 * ========================================================================== */

import type { CrystalNode } from "../engine/types";

/**
 * In-memory crystal storage.
 *
 * Замените на реальную distributed БД для multi-node sync.
 * API (query/update/forget) сохранится — меняется только реализация хранилища.
 */
export class StubCrystalStore {
  private nodes = new Map<string, CrystalNode>();
  private apiCalls = 0;
  private bytesTransferred = 0;

  /** GET /api/torus-atlas/crystals?crystal_id={id} */
  query(crystal_id: string, importance_threshold?: number): CrystalNode[] {
    this.apiCalls++;
    const result: CrystalNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.crystal_id !== crystal_id) continue;
      if (importance_threshold !== undefined && node.importance < importance_threshold) continue;
      result.push(node);
      this.bytesTransferred += JSON.stringify(node).length;
    }
    return result.sort((a, b) => b.importance - a.importance);
  }

  /** POST /api/torus-atlas/crystals */
  upsert(node: CrystalNode): CrystalNode {
    this.apiCalls++;
    this.nodes.set(node.node_id, node);
    this.bytesTransferred += JSON.stringify(node).length;
    return node;
  }

  /** DELETE /api/torus-atlas/crystals/{node_id} */
  forget(node_id: string): boolean {
    this.apiCalls++;
    const existed = this.nodes.delete(node_id);
    if (existed) this.bytesTransferred += 200; // approx
    return existed;
  }

  /** Forget all nodes for a crystal_id matching a content substring */
  forgetByContent(crystal_id: string, content_substring: string): number {
    let count = 0;
    for (const [id, node] of this.nodes.entries()) {
      if (node.crystal_id !== crystal_id) continue;
      if (node.content.toLowerCase().includes(content_substring.toLowerCase())) {
        this.nodes.delete(id);
        count++;
      }
    }
    this.apiCalls += count;
    return count;
  }

  listAll(): CrystalNode[] {
    return Array.from(this.nodes.values()).sort((a, b) => b.updated_at - a.updated_at);
  }

  getStats(): { total_nodes: number; api_calls: number; bytes: number } {
    return {
      total_nodes: this.nodes.size,
      api_calls: this.apiCalls,
      bytes: this.bytesTransferred,
    };
  }

  clear(): void {
    this.nodes.clear();
    this.apiCalls = 0;
    this.bytesTransferred = 0;
  }
}

export const STUB_CRYSTAL_STORE_ID = "stub:in-memory-map@local";
