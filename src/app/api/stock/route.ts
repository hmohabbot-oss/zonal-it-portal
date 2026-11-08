import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request:Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  if(session.role==="branch_user") return NextResponse.json({error:"Not available for branch accounts."},{status:403});
  const database = db();
  const items = database.prepare(`SELECT id,item_type,brand_model,serial_no,received_at,quantity,
    available_quantity,condition,source FROM stock_items ORDER BY item_type`).all();
  const totals = database.prepare(`SELECT COALESCE(SUM(available_quantity),0) AS available,
    COALESCE(SUM(quantity-available_quantity),0) AS deployed FROM stock_items`).get() as {available:number;deployed:number};
  const issues = database.prepare(`SELECT id,branch_name,issued_at,issued_to,faulty_item_returned,
    faulty_item_details FROM stock_issues ORDER BY id DESC`).all();
  return NextResponse.json({ items, ...totals, issues });
}

export async function POST(request: Request) {
  const session=readSession(request); if(!session) return NextResponse.json({error:"Sign in required."},{status:401});
  if(session.role==="branch_user") return NextResponse.json({error:"Only zonal IT can issue buffer stock."},{status:403});
  const input = await request.json().catch(() => null);
  const itemId = Number(input?.stock_item_id);
  const branchName = typeof input?.branch_name === "string" ? input.branch_name.trim() : "";
  if (!Number.isInteger(itemId) || itemId < 1 || !branchName) {
    return NextResponse.json({ error: "Select an item and branch." }, { status: 400 });
  }
  const database = db();
  const item = database.prepare("SELECT available_quantity FROM stock_items WHERE id = ?").get(itemId) as {available_quantity:number}|undefined;
  if (!item) return NextResponse.json({ error: "Stock item not found." }, { status: 404 });
  if (item.available_quantity < 1) return NextResponse.json({ error: "No available units remain." }, { status: 409 });
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE stock_items SET available_quantity = available_quantity - 1 WHERE id = ?").run(itemId);
    database.prepare(`INSERT INTO stock_issues (stock_item_id,branch_name,issued_at,issued_to,faulty_item_details)
      VALUES (?,?,?,?,?)`).run(itemId,branchName,new Date().toISOString().slice(0,10),String(input.issued_to ?? ""),String(input.faulty_item_details ?? ""));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return NextResponse.json({ ok:true }, { status:201 });
}
