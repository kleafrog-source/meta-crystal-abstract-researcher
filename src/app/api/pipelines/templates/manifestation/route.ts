import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFERRED_CODES = [
  "GQC0S-f15",
  "TAC0S-de2",
  "NQC0S-977",
  "HDDRP-753",
  "DQC0R-142",
];

export async function POST() {
  try {
    const crystalCodes = await pickCrystalCodes();
    if (crystalCodes.length < 4) {
      return NextResponse.json(
        { ok: false, error: "Недостаточно кристаллов для создания тестовых manifestation-пайплайнов" },
        { status: 400 },
      );
    }

    const scanIds = crystalCodes.slice(0, Math.min(12, crystalCodes.length));
    const manifestIds = crystalCodes.slice(0, Math.min(5, crystalCodes.length));
    const donorIds = crystalCodes.slice(0, Math.min(4, crystalCodes.length));

    const templates = [
      {
        name: "Manifestation B - Isomorphisms",
        description: "Проверка графа изоморфизмов и влияния include_isomorphs на manifest.",
        steps: [
          { name: "Scan isomorphisms", action: "manifest_isomorphisms_scan", params: { crystal_ids: scanIds, threshold: 0.72 } },
          { name: "Micro notes", action: "manifest_micro_notes", params: { crystal_ids: manifestIds, temperature: 0.75 } },
          { name: "Manifest with isomorphs", action: "manifest_manifest", params: { crystal_ids: manifestIds, temperature: 0.45, include_isomorphs: true } },
        ],
      },
      {
        name: "Manifestation C - Diffuse Best",
        description: "Проверка генерации synthetic crystal через diffuse/best.",
        steps: [
          { name: "Micro notes", action: "manifest_micro_notes", params: { crystal_ids: donorIds, temperature: 0.7 } },
          { name: "Manifest donors", action: "manifest_manifest", params: { crystal_ids: donorIds, temperature: 0.45, include_isomorphs: false } },
          { name: "Diffuse best", action: "manifest_diffuse", params: { donor_ids: donorIds, temperature: 0.6, guidance: 0.65, superposition_size: 4, collapse_mode: "best", include_isomorphic_donors: false } },
        ],
      },
      {
        name: "Manifestation D1 - Diffuse Diverse",
        description: "Проверка ветки diffuse с collapse_mode=diverse.",
        steps: [
          { name: "Micro notes", action: "manifest_micro_notes", params: { crystal_ids: donorIds, temperature: 0.7 } },
          { name: "Manifest donors", action: "manifest_manifest", params: { crystal_ids: donorIds, temperature: 0.45, include_isomorphs: false } },
          { name: "Diffuse diverse", action: "manifest_diffuse", params: { donor_ids: donorIds, temperature: 0.6, guidance: 0.65, superposition_size: 6, collapse_mode: "diverse", include_isomorphic_donors: false } },
        ],
      },
      {
        name: "Manifestation D2 - Diffuse Manual",
        description: "Проверка ветки diffuse с collapse_mode=manual.",
        steps: [
          { name: "Micro notes", action: "manifest_micro_notes", params: { crystal_ids: donorIds, temperature: 0.7 } },
          { name: "Manifest donors", action: "manifest_manifest", params: { crystal_ids: donorIds, temperature: 0.45, include_isomorphs: false } },
          { name: "Diffuse manual", action: "manifest_diffuse", params: { donor_ids: donorIds, temperature: 0.6, guidance: 0.65, superposition_size: 5, collapse_mode: "manual", include_isomorphic_donors: false } },
        ],
      },
    ];

    const createdNames: string[] = [];
    for (const template of templates) {
      await db.pipeline.upsert({
        where: { name: template.name },
        update: {
          description: template.description,
          stepsJson: JSON.stringify({ steps: template.steps, profile: null }),
        },
        create: {
          name: template.name,
          description: template.description,
          stepsJson: JSON.stringify({ steps: template.steps, profile: null }),
        },
      });
      createdNames.push(template.name);
    }

    return NextResponse.json({
      ok: true,
      created: createdNames.length,
      names: createdNames,
      crystalSets: {
        scanIds,
        manifestIds,
        donorIds,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

async function pickCrystalCodes() {
  const preferred = await db.crystal.findMany({
    where: { code: { in: PREFERRED_CODES } },
    orderBy: { counter: "desc" },
    select: { code: true },
  });
  const recent = await db.crystal.findMany({
    orderBy: { counter: "desc" },
    take: 20,
    select: { code: true },
  });
  const unique = new Set<string>();
  for (const code of PREFERRED_CODES) unique.add(code);
  for (const row of preferred) unique.add(row.code);
  for (const row of recent) unique.add(row.code);
  return [...unique].filter(Boolean);
}
