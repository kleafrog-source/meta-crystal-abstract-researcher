import { NextResponse } from "next/server";
import { readCatalogueParameters, stageUpdatesBatch } from "@/lib/am-parameters-catalogue/catalogue";
import { classifyDomainLayer } from "@/lib/am-parameters-catalogue/domain-layer-config";
import { DOMAIN_LAYERS } from "@/lib/combinatorial-genesis/parameter-schema";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const parameters = await readCatalogueParameters();
    const matches = parameters.flatMap((parameter) => {
      const layer = classifyDomainLayer(parameter.technical_name, String(parameter.category ?? ""));
      return layer && (DOMAIN_LAYERS as readonly string[]).includes(layer) ? [{ parameter, layer }] : [];
    });
    const updates = matches.filter(({ parameter, layer }) => parameter.domain_layer !== layer).map(({ parameter, layer }) => ({ ...parameter, domain_layer: layer }));
    const staged = await stageUpdatesBatch(updates, "Regex-простановка domain_layer", "Слои каталога · regex");
    return NextResponse.json({ scanned: parameters.length, matched: matches.length, already_current: matches.length - updates.length, staged: staged.length, unmatched: parameters.length - matches.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
