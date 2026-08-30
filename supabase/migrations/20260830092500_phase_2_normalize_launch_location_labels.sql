-- Presentation-only corrections. Canonical location IDs and canonical codes remain unchanged.
update public.locations
set display_name = case canonical_code
  when 'ng' then 'Nigeria'
  when 'abuja' then 'Abuja'
  when 'gwarinpa' then 'Gwarinpa'
  else display_name
end,
updated_at = now()
where canonical_code in ('ng','abuja','gwarinpa');
