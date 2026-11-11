import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export type PortalSession = { userId: number; username: string; name: string; role: "super_admin" | "zonal_staff" | "branch_user"; branchName: string | null; branchCode: string | null; expires: number };
const COOKIE = "zonal_portal_session";
const SECRET = process.env.PORTAL_SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-preview-only-change-before-deployment");

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function matchesPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, Buffer.from(salt, "hex"), 64);
  const expectedBytes = Buffer.from(expected, "hex");
  return expectedBytes.length === actual.length && timingSafeEqual(actual, expectedBytes);
}

function ensureDemoUsers() {
  const database = db();
  if (process.env.NODE_ENV !== "production") {
    const zonalUsers = [
      {name:"Md. Mohabbot Hossain",username:"mohabbot211915"},
      {name:"Rajshahi Zonal IT Demo",username:"kader211931"},
    ];
    const saveUser=database.prepare(`INSERT OR IGNORE INTO users (name,email,password_hash,role,branch_id) VALUES (?,?,'','zonal_staff',NULL)`);
    for(const user of zonalUsers)saveUser.run(user.name,`${user.username}@zonal.local.invalid`);
  }
  const adminUsername=(process.env.PORTAL_ADMIN_USERNAME || (process.env.NODE_ENV !== "production" ? "admin" : "")).trim().toLowerCase();
  const adminPassword=process.env.PORTAL_ADMIN_PASSWORD || (process.env.NODE_ENV !== "production" ? "Admin@123456" : "");
  if(adminUsername && adminPassword.length >= 12) {
    database.prepare(`INSERT OR IGNORE INTO users (name,email,password_hash,role,branch_id) VALUES (?,?,?,'super_admin',NULL)`)
      .run("Portal Administrator",`${adminUsername}@admin.local.invalid`,hashPassword(adminPassword));
  }
}

export function authenticate(username: string, password: string, role: string, branchCode?: string) {
  ensureDemoUsers();
  const normalizedRole=role==="branch_user"?"branch_user":role==="super_admin"?"super_admin":"zonal_staff";
  const normalizedUsername=username.trim().toLowerCase();
  if(normalizedRole==="branch_user"&&process.env.NODE_ENV!=="production"){
    if(!branchCode||password!==username.trim())return null;
    const branch=db().prepare("SELECT id,name,code FROM branches WHERE code=? AND active=1").get(branchCode) as {id:number;name:string;code:string}|undefined;
    if(!branch)return null;
    const session:PortalSession={userId:0,username:normalizedUsername,name:`${normalizedUsername} · ${branch.name}`,role:"branch_user",branchName:branch.name,branchCode:branch.code,expires:Date.now()+8*60*60*1000};
    return {session,token:sign(session)};
  }
  const accountEmail=normalizedRole==="branch_user"?`${normalizedUsername}@branch-${(branchCode||"").toLowerCase()}.local.invalid`:normalizedRole==="super_admin"?`${normalizedUsername}@admin.local.invalid`:`${normalizedUsername}@zonal.local.invalid`;
  const user = db().prepare(`SELECT u.id,u.name,u.email,u.password_hash,u.role,b.name AS branch_name,b.code AS branch_code
    FROM users u LEFT JOIN branches b ON b.id=u.branch_id WHERE u.email=? AND u.active=1`)
    .get(accountEmail) as {id:number;name:string;email:string;password_hash:string;role:string;branch_name:string|null;branch_code:string|null}|undefined;
  if (!user || user.role !== role) return null;
  if(user.password_hash) {
    if(!matchesPassword(password,user.password_hash)) return null;
  } else if(user.role==="zonal_staff" && process.env.NODE_ENV !== "production"){
    const pattern=normalizedUsername.match(/^([a-z]+)(\d{6})$/);
    if(!pattern)return null;
    const expectedPassword=`${pattern[1]}@${pattern[2]}#`;
    const supplied=Buffer.from(password,"utf8"),expected=Buffer.from(expectedPassword,"utf8");
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
  }else return null;
  const session: PortalSession = { userId:user.id, username:user.email.split("@")[0], name:user.name, role:user.role as PortalSession["role"], branchName:user.branch_name, branchCode:user.branch_code, expires:Date.now()+8*60*60*1000 };
  return { session, token: sign(session) };
}

function sign(session: PortalSession) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}

export function readSession(request: Request): PortalSession | null {
  const token = request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!SECRET) return null;
  const actual = createHmac("sha256", SECRET).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (actual.length !== received.length || !timingSafeEqual(actual, received)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload,"base64url").toString()) as PortalSession;
    if (session.expires <= Date.now()) return null;
    if (session.userId > 0) {
      const user = db().prepare("SELECT role,active FROM users WHERE id=?").get(session.userId) as {role:string;active:number}|undefined;
      if (!user || !user.active || user.role !== session.role) return null;
    } else if (session.role === "branch_user") {
      const branch = db().prepare("SELECT active FROM branches WHERE code=?").get(session.branchCode) as {active:number}|undefined;
      if (!branch?.active) return null;
    } else return null;
    return session;
  }
  catch { return null; }
}

export const sessionCookie = (token:string) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
export const clearSessionCookie = `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
