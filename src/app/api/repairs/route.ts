import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const repairStatuses = ["In Repair", "Solved", "Sent to Head Office", "Returned to Branch"] as const;

export async function GET(request:Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  const rows = db().prepare(`SELECT id, branch_name, received_at, submitted_at, sender, device, brand_model,
    serial_no, receiver, reported_problem, status, delivered_at, handover_to
    FROM hardware_repairs ${session.role==="branch_user"?"WHERE sender=? OR branch_name=?":""} ORDER BY id DESC`).all(...(session.role==="branch_user"?[session.name,session.branchName]:[]));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  const input = await request.json().catch(() => null);
  if (!input || typeof input.branch_name !== "string" || !input.branch_name.trim() ||
      typeof input.device !== "string" || !input.device.trim() ||
      typeof input.reported_problem !== "string" || !input.reported_problem.trim()) {
    return NextResponse.json({ error: "Branch, device and problem are required." }, { status: 400 });
  }
  const database = db();
  const today = new Date().toISOString().slice(0, 10);
  const branchName=input.branch_name.trim();
  if(session.role==="branch_user"&&!branchName) return NextResponse.json({error:"Your account is not assigned to a branch."},{status:403});
  if(session.role==="branch_user") {
    const validBranch=database.prepare("SELECT name FROM branches WHERE name=? AND active=1").get(branchName) as {name:string}|undefined;
    if(!validBranch)return NextResponse.json({error:"Select a valid branch or sub-branch."},{status:400});
  }
  const result = database.prepare(`INSERT INTO hardware_repairs
    (branch_name, received_at, submitted_at, sender, device, brand_model, serial_no, receiver, reported_problem, status, destination)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(branchName, today, session.role==="branch_user"?session.name:String(input.sender ?? ""), input.device.trim(),
      String(input.brand_model ?? ""), String(input.serial_no ?? ""), session.role==="branch_user"?"Rajshahi Zonal IT":"Mohabbot Hossain", input.reported_problem.trim(),session.role==="branch_user"?"Forwarded to Zonal IT":"In Repair",session.role==="branch_user"?"zonal":"branch");
  const created = database.prepare(`SELECT id, branch_name, received_at, submitted_at, sender, device, brand_model,
    serial_no, receiver, reported_problem, status FROM hardware_repairs WHERE id = ?`).get(Number(result.lastInsertRowid));
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  if(session.role==="branch_user") return NextResponse.json({error:"Only zonal IT can update repair status."},{status:403});
  const input = await request.json().catch(() => null);
  if (!input || !Number.isInteger(Number(input.id)) || !repairStatuses.includes(input.status)) {
    return NextResponse.json({ error: "Hardware record and valid status are required." }, { status: 400 });
  }
  const database = db();
  const delivered = input.status === "Returned to Branch" || input.status === "Sent to Head Office" ? new Date().toISOString().slice(0, 10) : null;
  const result = database.prepare("UPDATE hardware_repairs SET status = ?, delivered_at = COALESCE(?, delivered_at) WHERE id = ?")
    .run(input.status, delivered, Number(input.id));
  if (!result.changes) return NextResponse.json({ error: "Hardware record not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
