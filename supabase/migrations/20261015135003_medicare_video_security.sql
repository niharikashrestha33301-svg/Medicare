-- Additive, server-only bridge for existing MediCare identities. Never expose this
-- schema in the Data API. Browser JWTs/metadata cannot set its actor context.
create schema if not exists medicare_video;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='medicare_video_api') then
    create role medicare_video_api nologin noinherit nobypassrls;
  end if;
end $$;
grant medicare_video_api to postgres;
revoke all on schema medicare_video from public;
grant usage on schema medicare_video to medicare_video_api;

create table if not exists medicare_video.users (
  id bigint primary key, name text not null, role text not null check(role in ('patient','doctor','admin')),
  status text not null check(status in ('Active','Suspended'))
);
create table if not exists medicare_video.doctors (
  id bigint primary key,user_id bigint not null unique references medicare_video.users(id),
  verified boolean not null default false,specialization text not null,consultation_fee numeric(12,2) not null check(consultation_fee>=0),
  currency text not null check(currency='INR'),available_slots jsonb not null default '[]'
);
create table if not exists medicare_video.appointments (
  id bigint primary key,patient_id bigint not null references medicare_video.users(id),doctor_id bigint not null references medicare_video.doctors(id),
  patient_name text not null,status text not null check(status in ('Pending','Confirmed','Completed','Cancelled')),
  appointment_date date not null,time_slot text not null
);
create index if not exists video_appointment_patient on medicare_video.appointments(patient_id,id);
create index if not exists video_appointment_doctor on medicare_video.appointments(doctor_id,id);
create table if not exists medicare_video.video_consultations (
  id uuid primary key,appointment_id bigint not null unique references medicare_video.appointments(id),
  status text not null default 'Scheduled' check(status in ('Scheduled','Waiting','In progress','Ended')),
  admitted boolean not null default false,generation integer not null default 0,
  patient_client uuid,doctor_client uuid,patient_seen timestamptz,doctor_seen timestamptz,
  started_at timestamptz,ended_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists medicare_video.video_signals (
  id bigint generated always as identity primary key,
  consultation_id uuid not null references medicare_video.video_consultations(id) on delete cascade,
  generation integer not null,sender_role text not null check(sender_role in ('patient','doctor')),
  payload text not null check(octet_length(payload)<=65536),created_at timestamptz not null default now()
);
create index if not exists video_signal_poll on medicare_video.video_signals(consultation_id,generation,id);
create index if not exists video_signal_retention on medicare_video.video_signals(created_at);

create or replace function medicare_video.actor_id() returns bigint language sql stable security invoker set search_path='' as $$
  select nullif(current_setting('medicare.actor_id',true),'')::bigint
$$;
create or replace function medicare_video.actor_role() returns text language sql stable security invoker set search_path='' as $$
  select nullif(current_setting('medicare.actor_role',true),'')
$$;
revoke all on all functions in schema medicare_video from public;
grant execute on all functions in schema medicare_video to medicare_video_api;

alter table medicare_video.users enable row level security;
alter table medicare_video.doctors enable row level security;
alter table medicare_video.appointments enable row level security;
alter table medicare_video.video_consultations enable row level security;
alter table medicare_video.video_signals enable row level security;
alter table medicare_video.users force row level security;
alter table medicare_video.doctors force row level security;
alter table medicare_video.appointments force row level security;
alter table medicare_video.video_consultations force row level security;
alter table medicare_video.video_signals force row level security;

create policy video_doctor_directory on medicare_video.doctors for select to medicare_video_api
  using((select medicare_video.actor_role()) in ('patient','doctor'));
create policy video_owned_appointments on medicare_video.appointments for select to medicare_video_api
  using(patient_id=(select medicare_video.actor_id()) and (select medicare_video.actor_role())='patient'
    or (select medicare_video.actor_role())='doctor' and exists(select 1 from medicare_video.doctors d where d.id=doctor_id and d.user_id=(select medicare_video.actor_id())));
create policy video_participant_identity on medicare_video.users for select to medicare_video_api
  using((select medicare_video.actor_role()) in ('patient','doctor') and (id=(select medicare_video.actor_id()) or role='doctor'
    or exists(select 1 from medicare_video.appointments a where a.patient_id=users.id)));
create policy video_owned_rooms on medicare_video.video_consultations for select to medicare_video_api
  using(exists(select 1 from medicare_video.appointments a where a.id=appointment_id));
create policy video_create_owned_room on medicare_video.video_consultations for insert to medicare_video_api
  with check(exists(select 1 from medicare_video.appointments a where a.id=appointment_id and a.status in ('Pending','Confirmed')));
create policy video_update_owned_room on medicare_video.video_consultations for update to medicare_video_api
  using(exists(select 1 from medicare_video.appointments a where a.id=appointment_id))
  with check(exists(select 1 from medicare_video.appointments a where a.id=appointment_id));
create policy video_read_owned_signals on medicare_video.video_signals for select to medicare_video_api
  using(exists(select 1 from medicare_video.video_consultations v where v.id=consultation_id));
create policy video_send_owned_signal on medicare_video.video_signals for insert to medicare_video_api
  with check(sender_role=(select medicare_video.actor_role()) and exists(select 1 from medicare_video.video_consultations v where v.id=consultation_id and v.admitted and v.generation=video_signals.generation));
create policy video_remove_owned_signals on medicare_video.video_signals for delete to medicare_video_api
  using(exists(select 1 from medicare_video.video_consultations v where v.id=consultation_id));

grant select on medicare_video.users,medicare_video.doctors,medicare_video.appointments to medicare_video_api;
grant select,insert on medicare_video.video_consultations to medicare_video_api;
grant update(status,admitted,generation,patient_client,doctor_client,patient_seen,doctor_seen,started_at,ended_at) on medicare_video.video_consultations to medicare_video_api;
grant select,insert,delete on medicare_video.video_signals to medicare_video_api;
grant usage,select on all sequences in schema medicare_video to medicare_video_api;
-- No grants to anon, authenticated, or PUBLIC. Only the trusted Express server
-- connects and SET LOCAL ROLEs before querying patient-scoped data.
