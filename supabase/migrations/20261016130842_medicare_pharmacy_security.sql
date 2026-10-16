-- Native Supabase pharmacy foundation. No existing MySQL data is replaced.
-- Apply only to the separate MediCare project after the native Auth foundation.
create table public.medicare_pharmacists (
 profile_id uuid primary key references public.medicare_profiles(id),
 registration_reference text not null check(length(registration_reference) between 1 and 160),
 active boolean not null default false
);
create function medicare_private.pharmacy_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.medicare_profiles where id=(select auth.uid()) and role='admin' and status='Active')
$$;
create function medicare_private.pharmacy_patient() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.medicare_profiles where id=(select auth.uid()) and role='patient' and status='Active')
$$;
create function medicare_private.pharmacy_reviewer() returns boolean language sql stable security invoker set search_path='' as $$
 select medicare_private.pharmacy_admin() and exists(select 1 from public.medicare_pharmacists where profile_id=(select auth.uid()) and active)
$$;
revoke all on function medicare_private.pharmacy_admin(),medicare_private.pharmacy_patient(),medicare_private.pharmacy_reviewer() from public,anon;
grant usage on schema medicare_private to authenticated;
grant execute on function medicare_private.pharmacy_admin(),medicare_private.pharmacy_patient(),medicare_private.pharmacy_reviewer() to authenticated;

create table public.medicare_pharmacy_products (
 id uuid primary key default gen_random_uuid(),sku text not null unique check(length(sku) between 1 and 80),
 name text not null check(length(name) between 1 and 180),category text not null check(length(category) between 1 and 80),
 description text not null check(length(description)<=4000),manufacturer text not null check(length(manufacturer)<=160),
 pack_size text not null check(length(pack_size)<=100),price_paise integer not null check(price_paise between 1 and 10000000),
 currency text not null default 'INR' check(currency='INR'),stock integer not null default 0 check(stock between 0 and 1000000),
 requires_prescription boolean not null default true,active boolean not null default false,
 version integer not null default 0 check(version>=0),updated_at timestamptz not null default now()
);
create table public.medicare_pharmacy_images (
 product_id uuid primary key references public.medicare_pharmacy_products(id),mime_type text not null check(mime_type in ('image/png','image/jpeg')),
 content bytea not null check(octet_length(content) between 12 and 1048576)
);
create table public.medicare_pharmacy_cart (
 patient_id uuid not null references public.medicare_profiles(id),product_id uuid not null references public.medicare_pharmacy_products(id),
 quantity integer not null check(quantity between 1 and 99),primary key(patient_id,product_id)
);
create table public.medicare_pharmacy_orders (
 id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.medicare_profiles(id),checkout_key uuid not null,
 status text not null check(status in ('Awaiting review','Awaiting payment','Confirmed','Packing','Dispatched','Delivered','Cancelled','Rejected','Expired','Test complete')),
 total_paise integer not null check(total_paise between 1 and 100000000),currency text not null default 'INR' check(currency='INR'),
 address text not null check(length(address) between 1 and 1000),phone text not null check(length(phone) between 7 and 30),
 prescription_required boolean not null,review_status text not null check(review_status in ('Not required','Pending','Approved','Rejected')),
 reviewed_by uuid references public.medicare_profiles(id),review_note text not null default '' check(length(review_note)<=1000),
 payment_method text not null check(payment_method in ('COD','Online')),payment_mode text not null default 'Live' check(payment_mode in ('Live','Test')),
 payment_status text not null default 'Unpaid',gateway_order_id text unique,gateway_payment_id text unique,
 carrier text not null default '',tracking_number text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(patient_id,checkout_key),
 check(not prescription_required or review_status<>'Not required'),
 check(status not in ('Confirmed','Packing','Dispatched','Delivered') or not prescription_required or (review_status='Approved' and reviewed_by is not null)),
 check(status not in ('Packing','Dispatched','Delivered') or payment_mode='Live'),
 check(status not in ('Packing','Dispatched','Delivered') or payment_method='COD' or payment_status='Paid'),
 check(status not in ('Dispatched','Delivered') or (length(carrier)>0 and length(tracking_number)>0))
);
create index medicare_pharmacy_patient_orders on public.medicare_pharmacy_orders(patient_id,created_at);
create table public.medicare_pharmacy_order_items (
 order_id uuid not null references public.medicare_pharmacy_orders(id),product_id uuid not null references public.medicare_pharmacy_products(id),
 name text not null,price_paise integer not null check(price_paise>0),quantity integer not null check(quantity between 1 and 99),primary key(order_id,product_id)
);
create table public.medicare_pharmacy_prescriptions (
 order_id uuid primary key references public.medicare_pharmacy_orders(id),filename text not null,
 mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')),content bytea not null check(octet_length(content) between 1 and 2097152)
);
create table public.medicare_pharmacy_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.medicare_pharmacy_orders(id),
 status text not null,note text not null check(length(note)<=1000),actor_id uuid references public.medicare_profiles(id),created_at timestamptz not null default now()
);
create index medicare_pharmacy_timeline on public.medicare_pharmacy_events(order_id,created_at);
-- All writes are mediated by transactional backend APIs after native identity cutover.
-- Clients cannot set approval, stock, prices, payment capture, dispatch, or order ownership.
alter table public.medicare_pharmacists enable row level security;
alter table public.medicare_pharmacy_products enable row level security;
alter table public.medicare_pharmacy_images enable row level security;
alter table public.medicare_pharmacy_cart enable row level security;
alter table public.medicare_pharmacy_orders enable row level security;
alter table public.medicare_pharmacy_order_items enable row level security;
alter table public.medicare_pharmacy_prescriptions enable row level security;
alter table public.medicare_pharmacy_events enable row level security;
revoke all on public.medicare_pharmacists,public.medicare_pharmacy_products,public.medicare_pharmacy_images,public.medicare_pharmacy_cart,public.medicare_pharmacy_orders,public.medicare_pharmacy_order_items,public.medicare_pharmacy_prescriptions,public.medicare_pharmacy_events from public,anon,authenticated;
grant select on public.medicare_pharmacy_products,public.medicare_pharmacy_images to anon;
grant select on public.medicare_pharmacists,public.medicare_pharmacy_products,public.medicare_pharmacy_images,public.medicare_pharmacy_cart,public.medicare_pharmacy_orders,public.medicare_pharmacy_order_items,public.medicare_pharmacy_prescriptions,public.medicare_pharmacy_events to authenticated;
create policy pharmacist_own on public.medicare_pharmacists for select to authenticated using(profile_id=(select auth.uid()));
create policy catalogue_public on public.medicare_pharmacy_products for select to anon using(active);
create policy catalogue_account on public.medicare_pharmacy_products for select to authenticated using(active or medicare_private.pharmacy_admin());
create policy image_public on public.medicare_pharmacy_images for select to anon,authenticated using(exists(select 1 from public.medicare_pharmacy_products p where p.id=product_id and p.active));
create policy cart_own on public.medicare_pharmacy_cart for select to authenticated using(patient_id=(select auth.uid()) and medicare_private.pharmacy_patient());
create policy orders_own_or_admin on public.medicare_pharmacy_orders for select to authenticated using((patient_id=(select auth.uid()) and medicare_private.pharmacy_patient()) or medicare_private.pharmacy_admin());
create policy items_order_access on public.medicare_pharmacy_order_items for select to authenticated using(exists(select 1 from public.medicare_pharmacy_orders o where o.id=order_id));
create policy events_order_access on public.medicare_pharmacy_events for select to authenticated using(exists(select 1 from public.medicare_pharmacy_orders o where o.id=order_id));
create policy prescription_owner_or_reviewer on public.medicare_pharmacy_prescriptions for select to authenticated using(exists(select 1 from public.medicare_pharmacy_orders o where o.id=order_id and ((o.patient_id=(select auth.uid()) and medicare_private.pharmacy_patient()) or medicare_private.pharmacy_reviewer())));
