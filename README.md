# MediCare Grand - Web Edition (React + Node.js + Supabase)

Web version of the original JavaFX/MySQL "Hospital Appointment System" (v4.0 Royal Aurora): same screens (Login/Register, Dashboard, Book Appointment, My Appointments), same dark glass theme with gold buttons, same 13 time slots and sample doctors.

## Run it
### Frontend-only demo (no backend)
1. In `client`, run `npm install` and `npm run dev`.
2. Open http://localhost:5173. If Supabase credentials are not configured, the app starts in local demo mode; create an account to sign in and try booking appointments.

Demo accounts and appointments are stored only in this browser's local storage. Do not use real passwords or patient data in demo mode; it is for trying the UI and is not connected to the hospital database.

### Connected setup
1. Create a free project at supabase.com. In **SQL Editor** paste and run `supabase/database.sql` (creates tables + the 3 sample doctors).
2. **Server:** `cd server && cp .env.example .env` -> fill `SUPABASE_URL` and the **service_role** key (Settings > API) -> `npm install && npm start`
3. **Client:** `cd client && cp .env.example .env` -> fill `SUPABASE_URL` and the **anon** key -> `npm install && npm run dev` -> open http://localhost:5173
4. Click "Create an account", then sign in.

## Differences from the desktop app
- Passwords are handled by Supabase Auth (hashed) - the desktop app stored them in plain text.
- A doctor's time slot can be booked only once; taken slots show struck-through. Enforced by a database unique index, so two people can't book the same slot.
- Doctors can only be booked on their "Available" days.
- Forgot password still says to contact the front desk, as in the original.
