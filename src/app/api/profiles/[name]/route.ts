import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await ctx.params;
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "generation";
    const displayName = decodeURIComponent(name);
    const storedName = `${mode}::${displayName}`;
    const profile =
      (await db.profile.findUnique({ where: { name: storedName } })) ??
      (mode === "generation"
        ? await db.profile.findUnique({ where: { name: displayName } })
        : null);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Профиль не найден" },
        { status: 404 },
      );
    }
    await db.profile.delete({ where: { id: profile.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
