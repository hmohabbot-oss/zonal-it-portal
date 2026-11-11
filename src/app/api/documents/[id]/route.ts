import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const mimeTypes: Record<string, string> = {
  ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const row = db().prepare("SELECT file_name, storage_path, visible_to_branches, branch_name FROM documents WHERE id=?")
    .get(Number(id)) as { file_name: string; storage_path: string; visible_to_branches: number; branch_name: string | null } | undefined;
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (session.role === "branch_user" && (!row.visible_to_branches || row.branch_name !== null)) {
    return NextResponse.json({ error: "You do not have access to this file." }, { status: 403 });
  }
  try {
    const file = await readFile(join(process.cwd(), "data", "documents", basename(row.storage_path)));
    const extension = row.file_name.slice(row.file_name.lastIndexOf(".")).toLowerCase();
    const safeName = row.file_name.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(file), { headers: {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      "Content-Length": String(file.byteLength),
      "Cache-Control": "private, no-store",
    } });
  } catch {
    return NextResponse.json({ error: "The stored file could not be opened." }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ error: "Only an administrator can modify shared files." }, { status: 403 });
  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const title = String(form?.get("title") || "").trim().slice(0, 160);
  const replacement = form?.get("file");
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  const database = db();
  const row = database.prepare("SELECT file_name, storage_path FROM documents WHERE id=?").get(Number(id)) as {file_name:string;storage_path:string}|undefined;
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  if (replacement instanceof File && replacement.size > 0) {
    const extension = extname(replacement.name).toLowerCase();
    if (!Object.keys(mimeTypes).includes(extension)) return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    if (replacement.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File size must be 10 MB or less." }, { status: 413 });
    const storedName = `${randomUUID()}${extension}`;
    const folder = join(process.cwd(), "data", "documents");
    await writeFile(join(folder, storedName), Buffer.from(await replacement.arrayBuffer()));
    database.prepare("UPDATE documents SET title=?, file_name=?, storage_path=?, file_size=? WHERE id=?")
      .run(title, replacement.name.slice(0,255), storedName, replacement.size, Number(id));
    await unlink(join(process.cwd(), "data", "documents", basename(row.storage_path))).catch(() => undefined);
  } else database.prepare("UPDATE documents SET title=? WHERE id=?").run(title, Number(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (session.role !== "super_admin") return NextResponse.json({ error: "Only an administrator can delete files." }, { status: 403 });
  const { id } = await context.params;
  const database = db();
  const row = database.prepare("SELECT storage_path FROM documents WHERE id=?").get(Number(id)) as {storage_path:string}|undefined;
  if (!row) return NextResponse.json({ error: "File not found." }, { status: 404 });
  database.prepare("DELETE FROM documents WHERE id=?").run(Number(id));
  await unlink(join(process.cwd(), "data", "documents", basename(row.storage_path))).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
