import type { BridgeIndexRow, JournalRecord } from "./types";

export function bridgeText(record: JournalRecord): string | null {
  const reverse = record.latest_verification?.reverse_query;
  if (!reverse) return null;
  return [reverse.query_en, reverse.query_ru, reverse.key_concepts.join(", ")]
    .filter(Boolean)
    .join("\n");
}

export function eligibleBridgeRecords(
  records: JournalRecord[],
  includeReview: boolean,
) {
  return records.filter((record) => {
    const status = record.latest_verification?.status;
    const approved = record.latest_user_verdict?.decision === "approved";
    return (
      Boolean(bridgeText(record)) &&
      (approved ||
        status === "verified" ||
        (includeReview && status === "review"))
    );
  });
}

export function filterBridgeCandidates(
  source: BridgeIndexRow,
  rows: BridgeIndexRow[],
  includeReview: boolean,
) {
  const opposite =
    source.modality === "audio"
      ? "image"
      : source.modality === "image"
        ? "audio"
        : null;
  if (!opposite) return [];
  return rows.filter(
    (row) =>
      row.modality === opposite &&
      row.record_id !== source.record_id &&
      (!source.asset_sha256 || row.asset_sha256 !== source.asset_sha256) &&
      (row.verification_status === "verified" ||
        row.verification_status === "approved" ||
        includeReview),
  );
}
