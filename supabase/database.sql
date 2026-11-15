-- MediCare Grand: run once in Supabase > SQL Editor (web version of the original hospital_db).
create table patients(id uuid primary key references auth.users on delete cascade, name text not null, email text unique not null, phone text, created_at timestamptz default now());
create table doctors(id serial primary key, name text not null, specialty text not null, available_days text not null, fee numeric(10,2) not null check(fee>=0));
create table appointments(id serial primary key, patient_id uuid not null references patients on delete cascade, doctor_id int not null references doctors,
  appointment_date date not null, time_slot text not null, status text not null default 'BOOKED' check(status in('BOOKED','CANCELLED')), created_at timestamptz default now());
-- A doctor's slot can be BOOKED only once (cancelled bookings free it). Enforced by the database itself.
create unique index no_double_booking on appointments(doctor_id,appointment_date,time_slot) where status='BOOKED';
create index on appointments(patient_id);
alter table patients enable row level security; alter table doctors enable row level security; alter table appointments enable row level security;  -- only the Node API (service key) reads/writes
insert into doctors(name,specialty,available_days,fee) values
 ('Dr. Ravi Kumar','Cardiology','Mon, Wed, Fri',500),('Dr. Priya Sharma','Dermatology','Tue, Thu',400),('Dr. Arun Raj','Orthopedics','Mon, Sat',600);
