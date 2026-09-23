export function emailEventDetails(job) {
  const date = job.eventDate
    ? new Intl.DateTimeFormat('es-MX', {dateStyle:'long',timeZone:'UTC'}).format(new Date(`${job.eventDate}T12:00:00Z`))
    : job.startsAt
      ? new Intl.DateTimeFormat('es-MX', {dateStyle:'long',timeZone:'America/Mexico_City'}).format(new Date(job.startsAt))
      : job.dayLabel ? `${job.dayLabel} · Mes por confirmar` : 'Fecha por confirmar';
  const time = job.startsAt
    ? new Intl.DateTimeFormat('es-MX', {timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(job.startsAt))
    : 'Horario por confirmar';
  return {date: `${date} · ${time}`, venue: [job.city, job.venue || 'Sede por confirmar'].filter(Boolean).join(' · ')};
}
