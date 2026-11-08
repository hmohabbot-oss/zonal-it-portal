import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { branchDirectory } from "@/lib/branch-directory";

declare global { var zonalPortalDb: DatabaseSync | undefined; }

export function db() {
  if (globalThis.zonalPortalDb) return globalThis.zonalPortalDb;
  const folder = join(process.cwd(), "data");
  mkdirSync(folder, { recursive: true });
  const database = new DatabaseSync(join(folder, "zonal-it.sqlite"));
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'branch', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER REFERENCES branches(id),
      name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('super_admin','zonal_staff','branch_user')), active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_no TEXT NOT NULL UNIQUE, branch_id INTEGER REFERENCES branches(id),
      branch_name TEXT NOT NULL, branch_code TEXT NOT NULL, issue TEXT NOT NULL, device TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium', status TEXT NOT NULL DEFAULT 'Open',
      contact_name TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '', troubleshooting TEXT NOT NULL DEFAULT '',
      satisfaction TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS hardware_repairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER REFERENCES branches(id), branch_name TEXT NOT NULL,
      received_at TEXT NOT NULL, sender TEXT NOT NULL DEFAULT '', device TEXT NOT NULL, brand_model TEXT NOT NULL DEFAULT '',
      serial_no TEXT NOT NULL DEFAULT '', receiver TEXT NOT NULL DEFAULT '', reported_problem TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'In progress', repair_notes TEXT NOT NULL DEFAULT '',
      delivered_at TEXT, handover_to TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT 'branch'
    );
    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL, brand_model TEXT NOT NULL,
      serial_no TEXT NOT NULL DEFAULT '', received_at TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      available_quantity INTEGER NOT NULL DEFAULT 1, condition TEXT NOT NULL DEFAULT 'New', source TEXT NOT NULL DEFAULT 'Head Office'
    );
    CREATE TABLE IF NOT EXISTS stock_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT, stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
      branch_id INTEGER REFERENCES branches(id), branch_name TEXT NOT NULL, issued_at TEXT NOT NULL,
      issued_to TEXT NOT NULL DEFAULT '', faulty_item_returned INTEGER NOT NULL DEFAULT 0,
      faulty_item_details TEXT NOT NULL DEFAULT '', returned_at TEXT
    );
    CREATE TABLE IF NOT EXISTS head_office_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, date_received TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received_from TEXT NOT NULL DEFAULT 'Head Office', brand_model TEXT NOT NULL DEFAULT '',
      item_serial_no TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New',
      signature_received TEXT NOT NULL DEFAULT '', where_supplied TEXT NOT NULL DEFAULT '',
      date_supplied TEXT NOT NULL DEFAULT '', sign_it TEXT NOT NULL DEFAULT '', take_date TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
      file_name TEXT NOT NULL, storage_path TEXT NOT NULL, uploaded_by INTEGER REFERENCES users(id),
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, visible_to_branches INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS ticket_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      user_id INTEGER REFERENCES users(id), satisfied INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id),
      entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const ticketColumns = database.prepare("PRAGMA table_info(tickets)").all() as { name: string }[];
  if (!ticketColumns.some((column) => column.name === "computer_ip")) database.exec("ALTER TABLE tickets ADD COLUMN computer_ip TEXT NOT NULL DEFAULT ''");
  if (!ticketColumns.some((column) => column.name === "resolved_at")) database.exec("ALTER TABLE tickets ADD COLUMN resolved_at TEXT");
  if (!ticketColumns.some((column) => column.name === "resolution_seconds")) database.exec("ALTER TABLE tickets ADD COLUMN resolution_seconds INTEGER");
  if (!ticketColumns.some((column) => column.name === "reporter_login_id")) database.exec("ALTER TABLE tickets ADD COLUMN reporter_login_id TEXT NOT NULL DEFAULT ''");
  if (!ticketColumns.some((column) => column.name === "solver_login_id")) database.exec("ALTER TABLE tickets ADD COLUMN solver_login_id TEXT NOT NULL DEFAULT ''");
  const repairColumns = database.prepare("PRAGMA table_info(hardware_repairs)").all() as { name: string }[];
  if (!repairColumns.some((column) => column.name === "submitted_at")) database.exec("ALTER TABLE hardware_repairs ADD COLUMN submitted_at TEXT");
  const documentColumns = database.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!documentColumns.some((column) => column.name === "branch_name")) database.exec("ALTER TABLE documents ADD COLUMN branch_name TEXT");
  if (!documentColumns.some((column) => column.name === "uploaded_by_name")) database.exec("ALTER TABLE documents ADD COLUMN uploaded_by_name TEXT NOT NULL DEFAULT ''");
  if (!documentColumns.some((column) => column.name === "file_size")) database.exec("ALTER TABLE documents ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0");
  const branchCount = (database.prepare("SELECT COUNT(*) AS count FROM branches").get() as { count: number }).count;
  if (!branchCount) {
    const branchRows = [
      ["CNB-014", "চাঁপাইনবাবগঞ্জ শাখা"], ["RJS-002", "রাজশাহী শাখা"], ["NOG-008", "নওগাঁ শাখা"],
      ["NAT-006", "নাটোর শাখা"], ["BOG-011", "বগুড়া শাখা"], ["PAB-019", "পাবনা উপশাখা"],
    ];
    const addBranch = database.prepare("INSERT INTO branches (code,name) VALUES (?,?)");
    for (const row of branchRows) addBranch.run(...row);
    const sampleTickets = [
      ["IT-26048","CNB-014","চাঁপাইনবাবগঞ্জ শাখা","শাখার LAN নেটওয়ার্ক সংযোগ বিচ্ছিন্ন","Network · Router","High","Open","মোঃ রাশেদুল হাসান","রহ","১০:৪২ AM"],
      ["IT-26047","RJS-002","রাজশাহী শাখা","HP LaserJet প্রিন্টারে কাগজ আটকে যাচ্ছে","Printer · HP LaserJet","Medium","In progress","আফসানা রহমান","আর","১০:১৮ AM"],
      ["IT-26046","NOG-008","নওগাঁ শাখা","ইমেইলে লগইন করতে পারছেন না","Email · User access","Medium","Waiting","মোঃ সাইফুল ইসলাম","সই","০৯:৫৬ AM"],
      ["IT-26045","NAT-006","নাটোর শাখা","স্ক্যানার থেকে PDF তৈরি হচ্ছে না","Scanner · Canon DR-C240","Low","Resolved","নাজমা খাতুন","নখ","০৯:২৭ AM"],
      ["IT-26044","BOG-011","বগুড়া শাখা","কোর ব্যাংকিং টার্মিনাল ধীরগতিতে চলছে","PC · Terminal 03","High","In progress","মোঃ ইমরান হোসেন","ইহ","০৯:০৫ AM"],
      ["IT-26043","PAB-019","পাবনা উপশাখা","UPS ব্যাটারি ব্যাকআপ থাকছে না","UPS · Power backup","Medium","Resolved","শারমিন আক্তার","শআ","গতকাল"],
    ];
    const addTicket = database.prepare(`INSERT INTO tickets
      (ticket_no,branch_code,branch_name,issue,device,priority,status,contact_name,assigned_to,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const [no,code,name,issue,device,priority,status,contact,initials,time] of sampleTickets) {
      addTicket.run(no,code,name,issue,device,priority,status,contact,initials,time);
    }
  }
  database.prepare("INSERT OR IGNORE INTO branches (code,name) VALUES ('GDA-021','Godagari Branch')").run();
  database.prepare(`INSERT OR IGNORE INTO tickets
    (ticket_no,branch_code,branch_name,issue,device,priority,status,contact_name,assigned_to,created_at)
    VALUES ('IT-26049','GDA-021','Godagari Branch','Cash report is not printing correctly','Printer · HP LaserJet','Medium','Open','Godagari Branch User','GU','11:23 AM')`).run();
  database.prepare(`INSERT OR IGNORE INTO tickets
    (ticket_no,branch_code,branch_name,issue,device,priority,status,contact_name,assigned_to,created_at)
    VALUES ('IT-26050','GDA-021','Godagari Branch','Branch email sign-in needs support','Email · User Access','Medium','In progress','Godagari Branch User','GU','10:15 AM')`).run();
  database.prepare("UPDATE branches SET active=0").run();
  const upsertBranch=database.prepare(`INSERT INTO branches (code,name,kind,active) VALUES (?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name,kind=excluded.kind,active=1`);
  for(const [code,name] of branchDirectory)upsertBranch.run(code,name,/sub[- ]branch/i.test(name)?"sub_branch":"branch");
  const repairCount = (database.prepare("SELECT COUNT(*) AS count FROM hardware_repairs").get() as {count:number}).count;
  if (!repairCount) {
    const addRepair = database.prepare(`INSERT INTO hardware_repairs
      (branch_name,received_at,sender,device,brand_model,serial_no,receiver,reported_problem,status)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    addRepair.run("Niamatpur Sub-Branch","2025-07-08","Branch IT Contact","Desktop","Dell OptiPlex 3080","95HTF149","Mohabbot","OS Corrupt","In Repair");
    addRepair.run("Sujanagar Branch","2025-06-30","Branch IT Contact","Desktop","HP-2000","5GJH2N5","Mohabbot","Power Supply","In Repair");
    addRepair.run("Naziapur Branch","2025-06-30","Branch IT Contact","Desktop","HP-2000","JERQ7T2","Mohabbot","HDD Failure","Solved");
  }
  const stockCount = (database.prepare("SELECT COUNT(*) AS count FROM stock_items").get() as {count:number}).count;
  if (!stockCount) {
    const addStock = database.prepare(`INSERT INTO stock_items
      (item_type,brand_model,serial_no,received_at,quantity,available_quantity,condition,source)
      VALUES (?,?,?,?,?,?,?,?)`);
    const router = addStock.run("Router","MikroTik RB2011","MT-RB-014","2025-01-15",2,1,"New","Head Office");
    const sw = addStock.run("Network Switch","Cisco 2960","CS-2960-021","2025-02-08",2,1,"New","Head Office");
    addStock.run("UPS","APC 650VA","APC-650-008","2025-03-01",1,1,"New","Head Office");
    addStock.run("LTE Modem","Huawei B310","HW-B310-004","2025-03-12",1,1,"New","Head Office");
    addStock.run("Desktop PC","Dell OptiPlex 3080","DE-3080-009","2025-04-02",1,1,"New","Head Office");
    const issue = database.prepare(`INSERT INTO stock_issues (stock_item_id,branch_name,issued_at,issued_to) VALUES (?,?,?,?)`);
    issue.run(Number(router.lastInsertRowid),"Godagari Branch","2025-06-12","Godagari Branch IT User");
    issue.run(Number(sw.lastInsertRowid),"Chapai Branch","2025-07-02","Chapai Branch IT User");
  }
  globalThis.zonalPortalDb = database;
  return database;
}
