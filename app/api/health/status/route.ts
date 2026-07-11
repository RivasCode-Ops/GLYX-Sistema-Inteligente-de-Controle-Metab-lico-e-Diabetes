import { NextResponse } from "next/server";
import { getHealthIntegrationStatus } from "@/lib/health/config";

export async function GET() {
  return NextResponse.json(getHealthIntegrationStatus());
}
