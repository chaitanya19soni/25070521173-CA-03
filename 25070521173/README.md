# Careline — Hospital Management

A small full stack CA 03 project for **Chaitanya**. Plain JavaScript throughout: React + Vite in `client`, Express + Mongoose + jsonwebtoken in `server`. Styling uses ordinary CSS. No inventory, billing, UI framework, or external authentication service.

## Requirements

- Node.js 22.12+ (Node 24 recommended)
- A running MongoDB Community Server, or a MongoDB Atlas connection string
- MongoDB Compass to inspect the database. Compass is a database client; it does not start a MongoDB server.

## Start locally

Open a terminal in `server`:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env`. Set `JWT_SECRET` to a random secret with at least 32 characters. To generate one:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start your MongoDB server. The default URI is `mongodb://127.0.0.1:27017/chaitanya_hospital`. Connect Compass to the same URI. Then:

```powershell
npm run seed
npm run dev
```

In a second terminal, open `client`:

```powershell
npm install
npm run dev
```

Visit **http://localhost:5173**. Vite forwards `/api` requests to Express on port 5000. If you change the API port, also change `client/vite.config.js`.

## Demo accounts

Run the seed command first. All demo accounts use **Careline123!**.

| Role | Email |
| --- | --- |
| Administrator (Chaitanya) | admin@careline.test |
| Doctor (Meera Shah) | doctor@careline.test |
| Doctor (Arjun Rao) | arjun@careline.test |
| Staff | staff@careline.test |
| Patient | patient@careline.test |

Seeding adds missing accounts; it does not clear data or reset existing passwords. Demo credentials are for local assessment using fictional data.

## Features and permissions

- **Patient:** register, log in, book a doctor appointment, cancel own appointments, see own records and hospital stays.
- **Doctor:** see assigned appointments and admissions, complete/cancel appointments, read history for assigned patients, add diagnoses, prescriptions, notes, and optional follow-up dates.
- **Staff:** register patients, book/manage appointments, admit/discharge patients, view occupied and available beds. No access to consultation records.
- **Administrator:** oversee appointments, medical records, admissions, and the directory; create patient, doctor, and staff accounts.

There are eight fixed beds across wards A and B. Each patient can have only one active admission. Each bed can have only one active patient. Doctor appointment slots are fixed half-hour slots between 09:00–12:00 and 14:00–16:00, in India Standard Time. Database unique indexes prevent double booking, including simultaneous requests. Cancelled appointment slots and discharged beds become available again. A follow-up recommendation does not automatically book an appointment.

Public signup always creates a patient. Backend permissions apply independently of the UI. Passwords are salted and hashed using Node's built-in scrypt. JWTs expire after eight hours and are kept in browser session storage. The app reads the account's current role from the database on each authenticated request. Sign out clears the browser token; it does not revoke an already copied token before expiry.

## Main API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | /api/auth/register, /api/auth/login | Authentication |
| GET | /api/me | Current account |
| GET, POST | /api/users | Scoped directory / create account |
| GET | /api/availability?doctor=ID&date=YYYY-MM-DD | Available appointment slots |
| GET, POST | /api/appointments | List / book appointments |
| PATCH | /api/appointments/:id | Complete or cancel |
| DELETE | /api/appointments/:id | Staff/admin delete cancelled appointment |
| GET, POST | /api/records | Read / add medical records |
| GET, POST | /api/admissions | List / admit |
| PATCH | /api/admissions/:id/discharge | Discharge and free bed |

## Verification

```powershell
cd server
npm test
npm run test:integration
cd ../client
npm run build
```

For a complete demonstration, use two different browser sessions: book as patient, log in as the assigned doctor to add a record, and verify the patient can read it. As staff, admit and discharge the patient. Check that booking an occupied doctor slot and assigning an occupied bed are rejected. As administrator, create a staff or doctor account. A fresh signup must remain a patient even if a request supplies another role.

## Submission

Keep `client` and `server` directly inside the PRN folder. This workspace currently uses `25070521173`; confirm this is Chaitanya's PRN before submission. Based on the recording, the repository name should be `PRN-CA-03`. Push source files and both package lockfiles, excluding `.env`, `node_modules`, and `dist`. Open the GitHub repository link in another browser to verify access and the uploaded files before submitting it.
