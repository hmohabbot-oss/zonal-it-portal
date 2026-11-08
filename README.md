# Zonal IT Support & Operations Portal

**Rajshahi Zone · Islami Bank Bangladesh PLC**

A local-first web portal prototype for recording branch IT support requests, tracking hardware sent for repair, managing Head Office reserve items, and producing date-filtered operational registers.

> **Project status:** Development prototype for review. It is not connected to the bank's identity system, central network, or production database. Do not expose it to an office network or use it for live operational records before bank approval and a security review.

## What the portal covers

### Branch and sub-branch users

- Sign in without a public registration flow and select an assigned branch.
- Submit an IT problem with problem type, description, optional computer IP, and automatic submission time.
- View their branch's request status and Zonal IT's resolution notes; submit feedback after resolution.
- Forward faulty hardware with branch, device, model, serial number, sender, fault description, and timestamp.
- Download the requisition template and upload a completed form or supporting document.

### Zonal IT users

- Review incidents submitted through the portal and incidents logged from phone calls in one queue.
- Update status, add resolution notes, and record the solving user's ID. The elapsed time from submission to resolution is stored for reports.
- Receive branch hardware into a separate workshop repair register and update its status.
- Receive Head Office items into a separate inventory ledger, then record deployment to a branch.
- Review pending incident and hardware items through the notification menu.
- Generate date-filtered Incident/Problem, Repair Hardware, and New Inventory reports for print or CSV export.

The Head Office inventory ledger follows the paper register fields: Item, Date Received, Received From, Brand & Model, Serial No., Status, Signature Received, Where Supplied, Date Supplied, Sign IT, Take Date, and Remarks. Items still held at the Zonal Office are highlighted; deployment details are stored separately from the hardware repair log.

## Local development

### Requirements

- Node.js **22.13 or newer** (the database uses Node's built-in `node:sqlite` module)
- npm

### Start the portal

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:3001> in a browser. If port 3001 is already in use, start the development server on another port:

```powershell
npm run dev -- --port 3011
```

The SQLite database is created automatically at `data/zonal-it.sqlite` when an API route first accesses it. Uploaded files are stored under `data/documents/`. Keep both locations in mind when backing up or resetting local development data.

### Local sign-in notes

The local preview seeds development users and branch data automatically. Branch preview sign-in requires a branch selection; development authentication is intentionally simplified and is not the bank's real username/password service. Zonal IT development sign-in follows the local demo-account records. Do not reuse demo credentials or development password logic in a live environment.

## Software and architecture

| Layer | Technology | Role in this prototype |
|---|---|---|
| Web framework | Next.js 15.5.29 App Router | Serves the web UI and server-side API routes |
| UI | React 19.1.1 | Interactive portal screens and forms |
| Language | TypeScript 5.9.3 | Typed UI, API, and data structures |
| Database | SQLite through Node.js `node:sqlite` | Stores local branches, users, tickets, repairs, inventory, documents metadata, feedback, and activity history |
| Styling | Tailwind CSS 4.3.4 foundation plus custom CSS | Responsive layout and bank-green / deep-teal portal styling |
| Icons | lucide-react 0.468.0 | Consistent interface icons |
| File handling | Node.js filesystem APIs | Stores uploaded requisition/support files locally |

The browser UI calls Next.js route handlers. Those handlers validate the local session, scope branch users to their branch where applicable, and read/write the SQLite database. This prototype currently uses a local file database; it does not include a shared database service or bank single sign-on.

## Main data registers

- `tickets` — branch problem, type, reporter login ID, submission/resolution timestamps, status, resolution notes, solver login ID, and resolution duration.
- `hardware_repairs` — faulty branch devices received for workshop repair and their status.
- `stock_items` / `stock_issues` — available replacement stock and branch issue records.
- `head_office_inventory` — a separate Head Office receipt and deployment register.
- `documents` — uploaded requisition metadata and storage paths.
- `activity_log` — user-linked actions on operational records.
- `ticket_feedback`, `notifications`, `branches`, and `users` — supporting portal data.

## Current scope and known gaps

- The current portal has Branch User and Zonal IT operational views. A separate Super Admin role and its independent controls have not yet been implemented.
- Authentication is prototype-only. There is no integration with the bank's identity provider, SSO, directory, or official credential verification service.
- Records and uploaded files are stored on the local machine running the portal. Production-grade shared storage, backup/restore, monitoring, audit retention, and recovery are not configured here.
- Notifications are displayed from pending records in the portal; no bank email or SMS gateway is connected.
- The app needs a bank-approved hosting and database design, access-control review, security review, and operational sign-off before live use.

Production deployment steps are intentionally not included in this README; they should be prepared after the approved hosting, database, and identity approach is known.

## Repository map

```text
src/app/                 Portal screens and Next.js API routes
src/app/api/             Authentication, branches, tickets, repairs, stock, documents, inventory
src/lib/db.ts            SQLite schema and local seed data
src/lib/auth.ts          Prototype session and local authentication logic
public/brand/            Islami Bank emblem and logo assets
data/                    Local SQLite database and uploaded files (created at runtime)
```

## Handy commands

```powershell
npm run dev       # Start local development server
npm run build     # Build the production bundle for validation
npm run start     # Serve a built bundle locally
npm run lint      # Run ESLint
```


