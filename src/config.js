export const event = {
  slug: 'los-didis-2026', name: 'Los DiDis 2026',
  date: 'Fecha por confirmar', time: 'Horario por confirmar', venue: 'Sede por confirmar',
  description: 'Un espacio para compartir ideas, crear conexiones y abrir nuevas oportunidades.',
};
export const eventOptions = [
  {slug:'los-didis-2026-guadalajara',city:'Guadalajara',date:'2026-10-08',venue:'Salón Benavento',
    address:'Av. Adolfo López Mateos Sur 2550, Santa Isabel, Loma Bonita, 45645 Guadalajara, Jal.'},
  {slug:'los-didis-2026-monterrey',city:'Monterrey',date:'2026-10-13',venue:'Salón Verite',
    address:'Carr. Nacional 268, Villas La Rioja, 64984 Monterrey, N.L.'},
  {slug:'los-didis-2026-cdmx',city:'CDMX',date:'2026-10-16',venue:'Papalote Museo del Niño',
    address:'Av. de los Compositores 710, Ampliación Daniel Garza, Bosque de Chapultepec II Secc., Miguel Hidalgo, 11830 Ciudad de México, CDMX'},
];
const formatDate = value => new Intl.DateTimeFormat('es-MX', {dateStyle:'long',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
export const mapsUrl = address => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const eventLabel = item => `${item.city} · ${formatDate(item.date)}`;
export function passEvent(record) {
  const option=eventOptions.find(item=>item.slug===record?.eventSlug);
  return {...event,slug:record?.eventSlug || event.slug,
    date:record?.eventDate || option?.date ? formatDate(record?.eventDate || option.date) : record?.startsAt ? new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeZone:'America/Mexico_City'}).format(new Date(record.startsAt)) : event.date,
    time:record?.startsAt ? new Intl.DateTimeFormat('es-MX',{timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(record.startsAt)) : event.time,
    venue:[record?.city || option?.city,record?.venue || option?.venue || event.venue].filter(Boolean).join(' · '),
    address:option?.address};
}
export const registrationForm = {showAdditionalFields:false};
