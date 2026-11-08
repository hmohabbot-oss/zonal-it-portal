import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = new Set(["New", "Available", "Issued to Branch", "In Use", "Returned", "Other"]);

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role === "branch_user") return NextResponse.json({ error: "Only Zonal IT can access Head Office inventory." }, { status: 403 });
  const rows = db().prepare(`SELECT id, item, date_received, received_from, brand_model, item_serial_no,
    status, signature_received, where_supplied, date_supplied, sign_it, take_date, remarks
    FROM head_office_inventory ORDER BY id DESC`).all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role === "branch_user") return NextResponse.json({ error: "Only Zonal IT can receive items from Head Office." }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.item !== "string" || !input.item.trim()) {
    return NextResponse.json({ error: "Item is required." }, { status: 400 });
  }
  const status = String(input.status || "New");
  if (!statuses.has(status)) return NextResponse.json({ error: "Choose a valid inventory status." }, { status: 400 });
  const result = db().prepare(`INSERT INTO head_office_inventory
    (item, received_from, brand_model, item_serial_no, status, signature_received, where_supplied,
     date_supplied, sign_it, take_date, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.item.trim().slice(0, 120), String(input.received_from || "Head Office").trim().slice(0, 120),
      String(input.brand_model || "").trim().slice(0, 160), String(input.item_serial_no || "").trim().slice(0, 120), status,
      String(input.signature_received || "").trim().slice(0, 120), String(input.where_supplied || "").trim().slice(0, 160),
      String(input.date_supplied || "").trim().slice(0, 30), String(input.sign_it || "").trim().slice(0, 120),
      String(input.take_date || "").trim().slice(0, 30), String(input.remarks || "").trim().slice(0, 1000));
  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role === "branch_user") return NextResponse.json({ error: "Only Zonal IT can deploy inventory." }, { status: 403 });
  const input = await request.json().catch(() => null);
  const id = Number(input?.id);
  const branchName = String(input?.where_supplied || "").trim();
  if (!Number.isInteger(id) || id < 1 || !branchName) return NextResponse.json({ error: "Select a branch for deployment." }, { status: 400 });
  const database = db();
  const branch = database.prepare("SELECT name FROM branches WHERE name=? AND active=1").get(branchName) as { name:string } | undefined;
  if (!branch) return NextResponse.json({ error: "Select a valid branch or sub-branch." }, { status: 400 });
  const result = database.prepare(`UPDATE head_office_inventory SET status='Issued to Branch', where_supplied=?,
    date_supplied=?, sign_it=?, take_date=?, remarks=? WHERE id=? AND status NOT IN ('Issued to Branch','In Use')`)
    .run(branch.name, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()),
      String(input.sign_it || "").trim().slice(0, 120), String(input.take_date || "").trim().slice(0, 30),
      String(input.remarks || "").trim().slice(0, 1000), id);
  if (!result.changes) return NextResponse.json({ error: "Item not found or it has already been deployed." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
