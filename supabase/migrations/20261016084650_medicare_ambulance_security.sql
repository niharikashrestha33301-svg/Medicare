-- Staged native Supabase fleet schema. No vehicles, accounts, GPS or dispatches are seeded.
-- Existing MySQL identities must be explicitly mapped before the live backend switches.
create table public.medicare_ambulance_drivers (
 user_id uuid primary key references public.medicare_profiles(id),organization text not null check(length(organization) between 1 and 160),
 license_reference text not null check(length(license_reference) between 1 and 160),phone text not null check(length(phone) between 7 and 30),
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),review_reason text not null default '',
 reviewed_by uuid references public.medicare_profiles(id),created_at timestamptz not null default now()
);
create table public.medicare_ambulance_vehicles (
 id uuid primary key default gen_random_uuid(),driver_id uuid not null references public.medicare_ambulance_drivers(user_id),
 registration text not null unique check(length(registration) between 1 and 40),description text not null check(length(description) between 1 and 250),
 status text not null default 'Pending' check(status in ('Pending','Approved','Rejected')),available boolean not null default false
);
create index medicare_ambulance_driver_vehicles on public.medicare_ambulance_vehicles(driver_id,id);
create table public.medicare_emergency_requests (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),
 vehicle_id uuid not null references public.medicare_ambulance_vehicles(id),
 status text not null default 'Requested' check(status in ('Requested','Accepted','En route','Arrived','Completed','Cancelled','Declined','Expired')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index medicare_one_active_emergency on public.medicare_emergency_requests(patient_id) where status in ('Requested','Accepted','En route','Arrived');
create index medicare_vehicle_emergency on public.medicare_emergency_requests(vehicle_id,status);
-- Exact pickup and contact are separate so an unaccepted assignment cannot reveal them.
create table public.medicare_emergency_pickups (
 request_id uuid primary key references public.medicare_emergency_requests(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),
 phone text not null check(length(phone) between 7 and 30)
);
create table public.medicare_ambulance_vehicle_locations (
 vehicle_id uuid primary key references public.medicare_ambulance_vehicles(id),latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),accuracy double precision not null check(accuracy>0 and accuracy<=1000),
 measured_at timestamptz not null,received_at timestamptz not null default now()
);
-- Backend publishes only the assigned ambulance position, not a public fleet feed.
create table public.medicare_ambulance_positions (
 request_id uuid primary key references public.medicare_emergency_requests(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),
 measured_at timestamptz not null,received_at timestamptz not null default now()
);
create or replace function medicare_private.ambulance_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.medicare_profiles where id=auth.uid() and role='admin' and status='Active')
$$;
create or replace function medicare_private.approved_driver() returns boolean language sql stable security invoker set search_path='' as $$
 select medicare_private.account_active() and exists(select 1 from public.medicare_ambulance_drivers where user_id=auth.uid() and status='Approved')
$$;
-- A boolean-only private authorization helper lets a patient verify their assigned
-- provider's approval without granting access to private provider/profile rows.
create or replace function medicare_private.can_track_emergency(p_request uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.medicare_emergency_requests r
  join public.medicare_ambulance_vehicles v on v.id=r.vehicle_id
  join public.medicare_ambulance_drivers d on d.user_id=v.driver_id
  join public.medicare_profiles dp on dp.id=d.user_id
  join public.medicare_profiles pp on pp.id=r.patient_id
  where r.id=p_request and r.status in ('Accepted','En route','Arrived')
   and (r.patient_id=auth.uid() or v.driver_id=auth.uid())
   and v.status='Approved' and d.status='Approved' and dp.status='Active' and pp.status='Active')
$$;
revoke all on function medicare_private.can_track_emergency(uuid) from public,anon;
grant execute on function medicare_private.can_track_emergency(uuid) to authenticated;
revoke all on function medicare_private.ambulance_admin(),medicare_private.approved_driver() from public,anon;
grant execute on function medicare_private.ambulance_admin(),medicare_private.approved_driver() to authenticated;
revoke all on public.medicare_ambulance_drivers,public.medicare_ambulance_vehicles,public.medicare_emergency_requests,
 public.medicare_emergency_pickups,public.medicare_ambulance_vehicle_locations,public.medicare_ambulance_positions from public,anon,authenticated;
alter table public.medicare_ambulance_drivers enable row level security;
alter table public.medicare_ambulance_vehicles enable row level security;
alter table public.medicare_emergency_requests enable row level security;
alter table public.medicare_emergency_pickups enable row level security;
alter table public.medicare_ambulance_vehicle_locations enable row level security;
alter table public.medicare_ambulance_positions enable row level security;
create policy ambulance_driver_read on public.medicare_ambulance_drivers for select to authenticated using(medicare_private.account_active() and (user_id=auth.uid() or medicare_private.ambulance_admin()));
create policy ambulance_driver_apply on public.medicare_ambulance_drivers for insert to authenticated with check(medicare_private.account_active() and user_id=auth.uid() and status='Pending' and reviewed_by is null);
grant select on public.medicare_ambulance_drivers to authenticated;
grant insert(user_id,organization,license_reference,phone) on public.medicare_ambulance_drivers to authenticated;
create policy ambulance_vehicle_read on public.medicare_ambulance_vehicles for select to authenticated using(medicare_private.account_active() and (driver_id=auth.uid() or medicare_private.ambulance_admin()));
create policy ambulance_vehicle_apply on public.medicare_ambulance_vehicles for insert to authenticated with check(driver_id=auth.uid() and medicare_private.approved_driver() and status='Pending' and not available);
grant select on public.medicare_ambulance_vehicles to authenticated;
grant insert(driver_id,registration,description) on public.medicare_ambulance_vehicles to authenticated;
create policy emergency_request_read on public.medicare_emergency_requests for select to authenticated using(medicare_private.account_active() and (patient_id=auth.uid() or (medicare_private.approved_driver() and exists(select 1 from public.medicare_ambulance_vehicles v where v.id=vehicle_id and v.driver_id=auth.uid() and v.status='Approved'))));
grant select on public.medicare_emergency_requests to authenticated;
create policy emergency_pickup_read on public.medicare_emergency_pickups for select to authenticated using(medicare_private.can_track_emergency(request_id));
grant select on public.medicare_emergency_pickups to authenticated;
create policy driver_gps_read on public.medicare_ambulance_vehicle_locations for select to authenticated using(medicare_private.approved_driver() and exists(select 1 from public.medicare_ambulance_vehicles v where v.id=vehicle_id and v.driver_id=auth.uid() and v.status='Approved'));
grant select on public.medicare_ambulance_vehicle_locations to authenticated;
create policy assigned_ambulance_read on public.medicare_ambulance_positions for select to authenticated using(measured_at>=now()-interval '2 minutes' and measured_at<=now()+interval '30 seconds' and medicare_private.can_track_emergency(request_id));
grant select on public.medicare_ambulance_positions to authenticated;
-- All state transitions, availability, GPS ingestion and assignments are trusted
-- server writes with authentication, approval, freshness and row-lock validation.
-- Never grant browser UPDATE/INSERT on positions or bypass these checks with a service key.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['medicare_emergency_requests','medicare_ambulance_positions'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
