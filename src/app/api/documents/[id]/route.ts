import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
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
  if (session.role === "branch_user" && (!row.visible_to_branches || (row.branch_name && row.branch_name !== session.branchName))) {
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
