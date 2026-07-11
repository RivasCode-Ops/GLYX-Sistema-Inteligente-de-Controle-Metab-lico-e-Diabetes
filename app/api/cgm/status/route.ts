import { NextResponse } from "next/server";
import { getCgmIntegrationStatus } from "@/lib/cgm/config";

export async function GET() {
  return NextResponse.json(getCgmIntegrationStatus());
}
