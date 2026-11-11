import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"]);
const maxBytes = 10 * 1024 * 1024;

export async function GET(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const rows = db().prepare(`SELECT id, title, category, file_name, file_size, branch_name, uploaded_by_name,
    uploaded_at FROM documents ${session.role === "branch_user" ? "WHERE visible_to_branches=1 AND branch_name IS NULL" : ""} ORDER BY uploaded_at DESC, id DESC`).all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (! ["branch_user", "zonal_staff", "super_admin"].includes(session.role)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const extension = extname(file.name).toLowerCase();
  if (!allowedExtensions.has(extension)) return NextResponse.json({ error: "Supported files: PDF, Word, Excel, CSV, JPG and PNG." }, { status: 415 });
  if (file.size > maxBytes) return NextResponse.json({ error: "File size must be 10 MB or less." }, { status: 413 });
  const isRequisition = session.role === "branch_user";
  const branchName = isRequisition ? session.branchName : null;
  if (isRequisition && !branchName) return NextResponse.json({ error: "Your account is not assigned to a branch." }, { status: 403 });
  const title = String(form?.get("title") || file.name).trim().slice(0, 160);
  const storedName = `${randomUUID()}${extension}`;
  const folder = join(process.cwd(), "data", "documents");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, storedName), Buffer.from(await file.arrayBuffer()));
  const database = db();
  const result = database.prepare(`INSERT INTO documents
    (title, category, file_name, storage_path, uploaded_by, visible_to_branches, branch_name, uploaded_by_name, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(title || file.name, isRequisition ? "Requisition" : "Shared file", file.name.slice(0, 255), storedName, session.userId > 0 ? session.userId : null, isRequisition ? 0 : 1, branchName, session.name, file.size);
  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) }, { status: 201 });
}
