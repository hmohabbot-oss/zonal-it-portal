import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){const rows=db().prepare("SELECT code,name,kind FROM branches WHERE active=1 ORDER BY name").all();return NextResponse.json(rows);}
