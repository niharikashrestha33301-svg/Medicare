-- Native Supabase Auth foundation. Existing MySQL accounts are NOT silently
-- replaced or matched by email. Account migration requires verified identity.
create schema if not exists medicare_private;
revoke all on schema medicare_private from public;

create table if not exists public.medicare_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(name)<=160),phone text not null default '' check(length(phone)<=30),
 role text not null default 'patient' check(role in ('patient','doctor','admin')),
 status text not null default 'Active' check(status in ('Active','Suspended')),
 created_at timestamptz not null default now()
);
create or replace function medicare_private.new_patient_profile() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'auth' or tg_table_name<>'users' or tg_op<>'INSERT' then raise exception 'Invalid profile trigger';end if;
 insert into public.medicare_profiles(id,name,role) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),160),'patient');
 return new;
end $$;

revoke all on function medicare_private.new_patient_profile() from public,anon,authenticated;
create trigger medicare_patient_signup after insert on auth.users for each row execute function medicare_private.new_patient_profile();
insert into public.medicare_profiles(id,name,role)
 select id,left(coalesce(raw_user_meta_data->>'name',''),160),'patient' from auth.users on conflict(id) do nothing;

create table if not exists public.medicare_doctors (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null unique references public.medicare_profiles(id),
 name text not null,specialization text not null,about text not null default '',
 fee_paise integer not null check(fee_paise>=0),currency text not null default 'INR' check(currency='INR'),
 verified boolean not null default false,active boolean not null default false
);
create table if not exists public.medicare_availability (
 id uuid primary key default gen_random_uuid(),doctor_id uuid not null references public.medicare_doctors(id),
 starts_at timestamptz not null,ends_at timestamptz not null,enabled boolean not null default true,
 unique(doctor_id,starts_at),check(ends_at>starts_at)
);
create index if not exists medicare_doctor_slots on public.medicare_availability(doctor_id,starts_at);
create table if not exists public.medicare_appointments (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 doctor_id uuid not null references public.medicare_doctors(id),slot_id uuid not null references public.medicare_availability(id),
 status text not null default 'Confirmed' check(status in ('Pending','Confirmed','Cancelled','Completed')),
 fee_paise integer not null check(fee_paise>=0),currency text not null default 'INR' check(currency='INR'),
 phone text not null check(length(phone)<=30),created_at timestamptz not null default now()
);
create unique index if not exists medicare_one_booking_per_slot on public.medicare_appointments(slot_id) where status in ('Pending','Confirmed');
create index if not exists medicare_patient_visits on public.medicare_appointments(patient_id,created_at);
create index if not exists medicare_doctor_visits on public.medicare_appointments(doctor_id,created_at);
create table if not exists public.medicare_consultations (
 id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique references public.medicare_appointments(id),
 status text not null default 'Scheduled' check(status in ('Scheduled','Waiting','In progress','Ended')),
 admitted boolean not null default false,started_at timestamptz,ended_at timestamptz
);
create table if not exists public.medicare_health_records (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 category text not null check(category in ('history','prescription','medication')),title text not null,
 details text not null default '',record_date date not null,created_at timestamptz not null default now()
);
create index if not exists medicare_patient_records on public.medicare_health_records(patient_id,record_date);
create table if not exists public.medicare_health_readings (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 metric text not null check(metric in ('blood_pressure','heart_rate','weight','blood_sugar')),value numeric not null check(value>0),secondary_value numeric,measured_at timestamptz not null
);
create index if not exists medicare_patient_readings on public.medicare_health_readings(patient_id,measured_at);
create table if not exists public.medicare_medicine_plans (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 name text not null,dosage text not null,instructions text not null default '',timezone text not null,
 timings jsonb not null check(jsonb_typeof(timings)='array'),start_date date not null,end_date date not null,
 stock numeric not null default 0 check(stock>=0),refill_at numeric not null default 5 check(refill_at>=0),
 units_per_dose numeric not null default 1 check(units_per_dose>0),active boolean not null default true,check(end_date>=start_date)
);
create index if not exists medicare_patient_medicines on public.medicare_medicine_plans(patient_id,active);
create table if not exists public.medicare_medicine_events (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 plan_id uuid not null references public.medicare_medicine_plans(id),due_at timestamptz not null,
 dosage text not null,status text not null default 'Pending' check(status in ('Pending','Taken','Missed','Skipped','Cancelled')),
 unique(plan_id,due_at)
);
create index if not exists medicare_patient_doses on public.medicare_medicine_events(patient_id,due_at);
create table if not exists public.medicare_notification_history (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 kind text not null check(kind in ('dose','refill','test')),channel text not null check(channel in ('push','email')),
 status text not null,scheduled_for timestamptz,received_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists medicare_patient_notifications on public.medicare_notification_history(patient_id,created_at);
revoke all on public.medicare_profiles,public.medicare_doctors,public.medicare_availability,public.medicare_appointments,
 public.medicare_consultations,public.medicare_health_records,public.medicare_health_readings,public.medicare_medicine_plans,
 public.medicare_medicine_events,public.medicare_notification_history from public,anon,authenticated;

-- Privileged booking functions live outside exposed schemas, validate auth.uid()
-- and trusted profile rows, and never trust user_metadata roles or client fees.
create or replace function medicare_private.account_active() returns boolean
 language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.medicare_profiles where id=auth.uid() and status='Active')
$$;
create or replace function medicare_private.book_visit(p_slot uuid,p_phone text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();s public.medicare_availability;d public.medicare_doctors;visit uuid;room uuid;
begin
 if uid is null or not exists(select 1 from public.medicare_profiles where id=uid and role='patient' and status='Active') then raise exception 'Patient sign-in required';end if;
 if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Verify your email before booking';end if;
 if p_phone is null or length(trim(p_phone))=0 or length(p_phone)>30 then raise exception 'Valid contact phone required';end if;
 select * into s from public.medicare_availability where id=p_slot for update;
 if not found or not s.enabled or s.starts_at<=now() then raise exception 'This slot is unavailable';end if;
 select * into d from public.medicare_doctors where id=s.doctor_id;
 if not d.verified or not d.active or not exists(select 1 from public.medicare_profiles where id=d.profile_id and role='doctor' and status='Active') then raise exception 'Doctor unavailable';end if;
 if exists(select 1 from public.medicare_appointments where slot_id=s.id and status in ('Pending','Confirmed')) then raise exception 'This slot is already booked';end if;
 insert into public.medicare_appointments(patient_id,doctor_id,slot_id,phone,fee_paise) values(uid,d.id,s.id,trim(p_phone),d.fee_paise) returning id into visit;
 insert into public.medicare_consultations(appointment_id) values(visit) returning id into room;
 return jsonb_build_object('appointmentId',visit,'roomId',room);
end $$;
create or replace function public.medicare_book_visit(p_slot uuid,p_phone text) returns jsonb
 language sql security invoker set search_path='' as $$select medicare_private.book_visit(p_slot,p_phone)$$;
create or replace function medicare_private.cancel_visit(p_appointment uuid) returns boolean
 language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();v public.medicare_appointments;
begin
 if uid is null or not medicare_private.account_active() then raise exception 'Active patient sign-in required';end if;
 select * into v from public.medicare_appointments where id=p_appointment and patient_id=uid for update;
 if not found then raise exception 'Appointment not found';end if;
 if v.status='Cancelled' then return true;end if;
 if v.status not in ('Pending','Confirmed') then raise exception 'Appointment cannot be cancelled';end if;
 update public.medicare_appointments set status='Cancelled' where id=v.id;
 update public.medicare_consultations set status='Ended',admitted=false,ended_at=now() where appointment_id=v.id;
 return true;
end $$;
create or replace function public.medicare_cancel_visit(p_appointment uuid) returns boolean
 language sql security invoker set search_path='' as $$select medicare_private.cancel_visit(p_appointment)$$;
revoke all on all functions in schema medicare_private from public,anon;
revoke all on function public.medicare_book_visit(uuid,text),public.medicare_cancel_visit(uuid) from public,anon;
grant usage on schema medicare_private to authenticated;
grant execute on function medicare_private.book_visit(uuid,text),medicare_private.cancel_visit(uuid),public.medicare_book_visit(uuid,text),public.medicare_cancel_visit(uuid) to authenticated;
grant execute on function medicare_private.account_active() to authenticated;

-- Explicit grants plus RLS. No browser role can assign roles, verify a doctor,
-- create paid/captured events, admit a room, or update an appointment's owner.
alter table public.medicare_profiles enable row level security;
create policy medicare_self_profile on public.medicare_profiles for select to authenticated using(id=(select auth.uid()));
create policy medicare_edit_self on public.medicare_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant select on public.medicare_profiles to authenticated;
grant update(name,phone) on public.medicare_profiles to authenticated;
alter table public.medicare_doctors enable row level security;
create policy medicare_verified_directory on public.medicare_doctors for select to anon,authenticated using(verified and active or profile_id=(select auth.uid()));
grant select on public.medicare_doctors to anon,authenticated;
alter table public.medicare_availability enable row level security;
create policy medicare_read_slots on public.medicare_availability for select to authenticated using(exists(select 1 from public.medicare_doctors d where d.id=doctor_id and d.verified and d.active));
grant select on public.medicare_availability to authenticated;
alter table public.medicare_appointments enable row level security;
create policy medicare_own_visits on public.medicare_appointments for select to authenticated using((select medicare_private.account_active()) and (patient_id=(select auth.uid()) or exists(select 1 from public.medicare_doctors d where d.id=doctor_id and d.profile_id=(select auth.uid()))));
grant select on public.medicare_appointments to authenticated;
alter table public.medicare_consultations enable row level security;
create policy medicare_own_consultations on public.medicare_consultations for select to authenticated using(exists(select 1 from public.medicare_appointments a where a.id=appointment_id));
grant select on public.medicare_consultations to authenticated;

do $$ declare tab text;begin
 foreach tab in array array['medicare_health_records','medicare_health_readings','medicare_medicine_plans'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy patient_read on public.%I for select to authenticated using(patient_id=(select auth.uid()) and (select medicare_private.account_active()))',tab);
  execute format('create policy patient_insert on public.%I for insert to authenticated with check(patient_id=(select auth.uid()) and (select medicare_private.account_active()))',tab);
  execute format('create policy patient_update on public.%I for update to authenticated using(patient_id=(select auth.uid()) and (select medicare_private.account_active())) with check(patient_id=(select auth.uid()) and (select medicare_private.account_active()))',tab);
  execute format('create policy patient_remove on public.%I for delete to authenticated using(patient_id=(select auth.uid()) and (select medicare_private.account_active()))',tab);
  execute format('grant select,insert,update,delete on public.%I to authenticated',tab);
 end loop;
 foreach tab in array array['medicare_medicine_events','medicare_notification_history'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy patient_read on public.%I for select to authenticated using(patient_id=(select auth.uid()) and (select medicare_private.account_active()))',tab);
  execute format('grant select on public.%I to authenticated',tab);
 end loop;
end $$;

create table if not exists public.medicare_medical_reports (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 filename text not null,object_path text not null unique,mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),
 byte_size integer not null check(byte_size between 1 and 2097152),created_at timestamptz not null default now()
);
create index if not exists medicare_patient_reports on public.medicare_medical_reports(patient_id,created_at);
revoke all on public.medicare_medical_reports from public,anon,authenticated;
alter table public.medicare_medical_reports enable row level security;
create policy medicare_private_reports on public.medicare_medical_reports for all to authenticated
 using(patient_id=(select auth.uid()) and (select medicare_private.account_active()))
 with check(patient_id=(select auth.uid()) and split_part(object_path,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()));
grant select,insert,update,delete on public.medicare_medical_reports to authenticated;

-- Storage exists in hosted Supabase. The isolated SQL tests provide its contract.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('medicare-medical-reports','medicare-medical-reports',false,2097152,array['application/pdf','image/png','image/jpeg']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy medicare_report_download on storage.objects for select to authenticated
 using(bucket_id='medicare-medical-reports' and split_part(name,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()));
create policy medicare_report_upload on storage.objects for insert to authenticated
 with check(bucket_id='medicare-medical-reports' and split_part(name,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()));
create policy medicare_report_replace on storage.objects for update to authenticated
 using(bucket_id='medicare-medical-reports' and split_part(name,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()))
 with check(bucket_id='medicare-medical-reports' and split_part(name,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()));
create policy medicare_report_remove on storage.objects for delete to authenticated
 using(bucket_id='medicare-medical-reports' and split_part(name,'/',1)=(select auth.uid())::text and (select medicare_private.account_active()));
