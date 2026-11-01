import { NextRequest, NextResponse } from "next/server";
import { stage, validateParameter } from "@/lib/am-parameters-catalogue/catalogue";
type Context = { params: Promise<{ technical_name: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  try { const name = decodeURIComponent((await context.params).technical_name); const valid = validateParameter(await request.json()); if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 }); if (valid.parameter.technical_name !== name) return NextResponse.json({ error: "technical_name нельзя изменить через редактирование; создайте новый параметр и удалите прежний через очередь." }, { status: 400 }); const item = await stage("update", name, valid.parameter); return NextResponse.json({ ok: true, item }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { const name = decodeURIComponent((await context.params).technical_name); const body = await request.json().catch(() => ({})) as { reason?: string }; const item = await stage("delete", name, undefined, body.reason); return NextResponse.json({ ok: true, item }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
