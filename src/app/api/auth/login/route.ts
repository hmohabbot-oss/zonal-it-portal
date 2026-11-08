import { NextResponse } from "next/server";
import { authenticate, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if(process.env.NODE_ENV === "production" && !process.env.PORTAL_SESSION_SECRET)
    return NextResponse.json({error:"Portal sign-in is not configured by the administrator."},{status:503});
  const input = await request.json().catch(()=>null);
  if (!input || typeof input.username!=="string" || typeof input.password!=="string" || !["zonal_staff","branch_user"].includes(input.role) || (input.role==="branch_user"&&typeof input.branchCode!=="string"))
    return NextResponse.json({error:"Enter username, password and login type."},{status:400});
  const result = authenticate(input.username,input.password,input.role,input.branchCode);
  if (!result) return NextResponse.json({error:"Invalid credentials for the selected portal."},{status:401});
  const response = NextResponse.json({user:{username:result.session.username,name:result.session.name,role:result.session.role,branchName:result.session.branchName}});
  response.headers.set("Set-Cookie",sessionCookie(result.token));
  return response;
}
