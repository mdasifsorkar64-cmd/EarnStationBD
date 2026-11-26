-- Allow only active administrators to create or change offers.
-- Members retain the existing SELECT policy for active offers.
-- No DELETE policy is added.
drop policy if exists "admins insert offers" on public.offers;
create policy "admins insert offers"
on public.offers
for insert
to authenticated
with check ((select public.is_admin()));

drop policy if exists "admins update offers" on public.offers;
create policy "admins update offers"
on public.offers
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

notify pgrst, 'reload schema';
