import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminOnly(request: Request): { error: NextResponse | null } {
  const session = readSession(request);
  if (!session) return { error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  if (session.role !== "super_admin") return { error: NextResponse.json({ error: "Only an administrator can manage Zonal IT users." }, { status: 403 }) };
  return { error: null };
}

export async function GET(request: Request) {
  const auth = adminOnly(request);
  if (auth.error) return auth.error;
  const users = db().prepare(`SELECT id, name, substr(email,1,instr(email,'@')-1) AS username, active
    FROM users WHERE role='zonal_staff' ORDER BY name`).all();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const auth = adminOnly(request);
  if (auth.error) return auth.error;
  const input = await request.json().catch(() => null);
  const name = typeof input?.name === "string" ? input.name.trim().slice(0,120) : "";
  const username = typeof input?.username === "string" ? input.username.trim().toLowerCase() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!name || !/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 12)
    return NextResponse.json({ error: "Enter a name, a 3–40 character user ID, and a password of at least 12 characters." }, { status: 400 });
  try {
    const result = db().prepare(`INSERT INTO users (name,email,password_hash,role,branch_id,active)
      VALUES (?,?,?,'zonal_staff',NULL,1)`).run(name, `${username}@zonal.local.invalid`, hashPassword(password));
    return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That user ID is already in use." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const auth = adminOnly(request);
  if (auth.error) return auth.error;
  const input = await request.json().catch(() => null);
  const id = Number(input?.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const existing = db().prepare("SELECT id FROM users WHERE id=? AND role='zonal_staff'").get(id);
  if (!existing) return NextResponse.json({ error: "Zonal IT user not found." }, { status: 404 });
  const name = typeof input.name === "string" ? input.name.trim().slice(0,120) : undefined;
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : undefined;
  const password = typeof input.password === "string" ? input.password : "";
  if (username !== undefined && !/^[a-z0-9._-]{3,40}$/.test(username)) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  if (password && password.length < 12) return NextResponse.json({ error: "Password must be at least 12 characters." }, { status: 400 });
  try {
    if (name !== undefined) db().prepare("UPDATE users SET name=? WHERE id=?").run(name, id);
    if (username !== undefined) db().prepare("UPDATE users SET email=? WHERE id=?").run(`${username}@zonal.local.invalid`, id);
    if (password) db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(password), id);
    if (typeof input.active === "boolean") db().prepare("UPDATE users SET active=? WHERE id=?").run(input.active ? 1 : 0, id);
  } catch {
    return NextResponse.json({ error: "That user ID is already in use." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = adminOnly(request);
  if (auth.error) return auth.error;
  const input = await request.json().catch(() => null);
  const id = Number(input?.id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const result = db().prepare("UPDATE users SET active=0 WHERE id=? AND role='zonal_staff'").run(id);
  if (!result.changes) return NextResponse.json({ error: "Zonal IT user not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
