export const event = {
  slug: 'los-didis-2026', name: 'Los DiDis 2026',
  date: 'Fecha por confirmar', time: 'Horario por confirmar', venue: 'Sede por confirmar',
  description: 'Un espacio para compartir ideas, crear conexiones y abrir nuevas oportunidades.',
};
export const eventOptions = [
  {slug:'los-didis-2026-guadalajara',city:'Guadalajara',date:'2026-10-08'},
  {slug:'los-didis-2026-monterrey',city:'Monterrey',date:'2026-10-13'},
  {slug:'los-didis-2026-cdmx',city:'CDMX',date:'2026-10-16'},
];
const formatDate = value => new Intl.DateTimeFormat('es-MX', {dateStyle:'long',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
export const eventLabel = item => `${item.city} · ${formatDate(item.date)}`;
export function passEvent(record) {
  const option=eventOptions.find(item=>item.slug===record?.eventSlug);
  return {...event,slug:record?.eventSlug || event.slug,
    date:record?.eventDate || option?.date ? formatDate(record?.eventDate || option.date) : record?.startsAt ? new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeZone:'America/Mexico_City'}).format(new Date(record.startsAt)) : event.date,
    time:record?.startsAt ? new Intl.DateTimeFormat('es-MX',{timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(record.startsAt)) : event.time,
    venue:[record?.city || option?.city,record?.venue || event.venue].filter(Boolean).join(' · ')};
}
export const registrationForm = {showAdditionalFields:false};
