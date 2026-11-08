import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
export const runtime = "nodejs";
export async function GET(request:Request){const session=readSession(request);return session?NextResponse.json({user:{username:session.username,name:session.name,role:session.role,branchName:session.branchName}}):NextResponse.json({user:null},{status:401});}
