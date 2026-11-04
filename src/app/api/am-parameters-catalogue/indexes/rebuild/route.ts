import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Catalogue indexes are rebuilt from Service Bay. Open /service-bay#index-coverage." }, { status: 410 });
}
