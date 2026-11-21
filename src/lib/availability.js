// Statut « ouvert / fermé » d'un professionnel, calculé à l'heure du Gabon (UTC+1, sans heure d'été),
// quel que soit le fuseau de l'appareil du visiteur.
const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const LABELS = { sun: 'dimanche', mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi', fri: 'vendredi', sat: 'samedi' };
const GABON_OFFSET_MS = 3600000;
const pad = (n) => String(n).padStart(2, '0');

/** @returns {{ state: 'open'|'closed', label: string } | null}  null = aucun horaire renseigné */
export function openStatus(av, now = new Date()) {
  if (!av || !KEYS.some((k) => av[k]?.open && av[k].from && av[k].to)) return null;
  const local = new Date(now.getTime() + GABON_OFFSET_MS);
  const dayIndex = local.getUTCDay();
  const hhmm = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  const today = av[KEYS[dayIndex]];

  if (today?.open && hhmm >= today.from && hhmm < today.to) {
    return { state: 'open', label: `Ouvert · jusqu'à ${today.to}` };
  }
  if (today?.open && hhmm < today.from) {
    return { state: 'closed', label: `Fermé · ouvre à ${today.from}` };
  }
  for (let i = 1; i <= 7; i += 1) {
    const key = KEYS[(dayIndex + i) % 7];
    const d = av[key];
    if (d?.open && d.from) {
      const when = i === 1 ? 'demain' : LABELS[key];
      return { state: 'closed', label: `Fermé · ouvre ${when} à ${d.from}` };
    }
  }
  return { state: 'closed', label: 'Fermé' };
}
