import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "branch_user") return NextResponse.json({ error: "Branch users only." }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.id !== "string" || typeof input.satisfied !== "boolean") {
    return NextResponse.json({ error: "Ticket and feedback are required." }, { status: 400 });
  }
  const database = db();
  const ticket = database.prepare("SELECT id, status, satisfaction FROM tickets WHERE ticket_no = ? AND branch_code = ?")
    .get(input.id, session.branchCode) as { id: number; status: string; satisfaction: string | null } | undefined;
  if (!ticket) return NextResponse.json({ error: "Incident not found for this branch." }, { status: 404 });
  if (ticket.status !== "Resolved") return NextResponse.json({ error: "Feedback is available after Zonal IT solves the incident." }, { status: 409 });
  if (ticket.satisfaction) return NextResponse.json({ error: "Feedback has already been submitted." }, { status: 409 });
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
  database.prepare("INSERT INTO ticket_feedback (ticket_id, user_id, satisfied, note) VALUES (?, NULL, ?, ?)")
    .run(ticket.id, input.satisfied ? 1 : 0, note);
  database.prepare("UPDATE tickets SET satisfaction = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(input.satisfied ? "Thank you" : "Needs follow-up", ticket.id);
  return NextResponse.json({ ok: true });
}
