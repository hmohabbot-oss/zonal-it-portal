import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["Open", "In progress", "Waiting", "Resolved"] as const;

export async function GET(request:Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  const rows = db().prepare(`SELECT ticket_no AS id, branch_name AS branch, branch_code AS code,
    issue, device, priority, status, created_at AS time, contact_name AS person, assigned_to AS initials,
    troubleshooting AS resolution_notes, satisfaction, computer_ip, contact_phone,
    created_at AS submitted_at, resolved_at, resolution_seconds,
    reporter_login_id AS user_id, solver_login_id AS solver_id
    FROM tickets ${session.role==="branch_user"?"WHERE branch_code=?":""} ORDER BY id DESC`).all(...(session.role==="branch_user"?[session.branchCode]:[]));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  const input = await request.json().catch(() => null);
  if (!input || typeof input.branch !== "string" || typeof input.issue !== "string" || !input.issue.trim()) {
    return NextResponse.json({ error: "Branch and problem description are required." }, { status: 400 });
  }
  const database = db();
  const aliases: Record<string,string> = {
    "Chapai Branch":"চাঁপাইনবাবগঞ্জ শাখা", "Rajshahi Branch":"রাজশাহী শাখা",
    "Naogaon Branch":"নওগাঁ শাখা", "Natore Branch":"নাটোর শাখা",
    "Bogura Branch":"বগুড়া শাখা", "Pabna Sub-Branch":"পাবনা উপশাখা",
  };
  const branchName = session.role==="branch_user" ? session.branchName : (aliases[input.branch] ?? input.branch.trim());
  if(!branchName) return NextResponse.json({error:"Your account is not assigned to a branch."},{status:403});
  const branch = database.prepare("SELECT id,code,name FROM branches WHERE name = ?").get(branchName) as {id:number;code:string;name:string}|undefined;
  if(!branch) return NextResponse.json({error:"Select a valid branch or sub-branch."},{status:400});
  const number = Number((database.prepare("SELECT COUNT(*) AS count FROM tickets").get() as {count:number}).count) + 26043;
  const ticketNo = `IT-${number}`;
  const reporterLoginId=session.role === "branch_user" ? session.username : String(input.loginId ?? "").trim();
  database.prepare(`INSERT INTO tickets (ticket_no, branch_id, branch_name, branch_code, issue, device, priority, contact_name, contact_phone, computer_ip, reporter_login_id)
    VALUES (?, ?, ?, ?, ?, ?, 'Medium', ?, ?, ?, ?)`).run(ticketNo, branch.id, branch.name, branch.code, input.issue.trim(), String(input.problemType ?? input.device ?? "Other"), reporterLoginId || "Phone Call", String(input.contactPhone ?? "").trim(), String(input.computerIp ?? "").trim(), reporterLoginId || "Phone Call");
  const created = database.prepare(`SELECT ticket_no AS id, branch_name AS branch, branch_code AS code,
    issue, device, priority, status, created_at AS time, contact_name AS person, assigned_to AS initials,
    computer_ip, contact_phone, created_at AS submitted_at, resolved_at, resolution_seconds,
    reporter_login_id AS user_id, solver_login_id AS solver_id
    FROM tickets WHERE ticket_no = ?`).get(ticketNo);
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  if(session.role==="branch_user") return NextResponse.json({error:"Only zonal IT can update incident status."},{status:403});
  const input = await request.json().catch(() => null);
  if (!input || typeof input.id !== "string" || !statuses.includes(input.status)) {
    return NextResponse.json({ error: "Ticket and valid status are required." }, { status: 400 });
  }
  const database = db();
  const result = database.prepare(`UPDATE tickets SET status = ?, troubleshooting = ?,
    solver_login_id = CASE WHEN ? = 'Resolved' THEN ? ELSE solver_login_id END,
    resolved_at = CASE WHEN ? = 'Resolved' AND resolved_at IS NULL THEN CURRENT_TIMESTAMP WHEN ? <> 'Resolved' THEN NULL ELSE resolved_at END,
    resolution_seconds = CASE WHEN ? = 'Resolved' AND resolved_at IS NULL
      THEN MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(created_at)) * 86400 AS INTEGER))
      WHEN ? <> 'Resolved' THEN NULL ELSE resolution_seconds END,
    updated_at = CURRENT_TIMESTAMP WHERE ticket_no = ?`)
    .run(input.status, String(input.notes ?? ""), input.status, session.username, input.status, input.status, input.status, input.status, input.id);
  if (!result.changes) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  const ticket=database.prepare("SELECT id FROM tickets WHERE ticket_no=?").get(input.id) as {id:number}|undefined;
  if(ticket)database.prepare("INSERT INTO activity_log (user_id,entity_type,entity_id,action,details) VALUES (?,?,?,?,?)")
    .run(session.userId>0?session.userId:null,"ticket",ticket.id,`status:${input.status}`,JSON.stringify({solverId:session.username,notes:String(input.notes??"")}));
  return NextResponse.json({ ok: true });
}
