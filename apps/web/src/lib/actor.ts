/** Actores demo autorizados a conceder/denegar permiso (sin auth real aún). */

export type Actor = {
  id: string;
  name: string;
  role: string;
};

export const DEMO_ACTORS: Actor[] = [
  { id: 'ana.ruiz', name: 'Ana Ruiz', role: 'Finanzas' },
  { id: 'carlos.mendez', name: 'Carlos Méndez', role: 'Controller' },
  { id: 'lucia.vega', name: 'Lucía Vega', role: 'CFO' },
];

const STORAGE_KEY = 'ezallow.demoActorId';

export function loadActorId(): string {
  if (typeof window === 'undefined') return DEMO_ACTORS[0].id;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && DEMO_ACTORS.some((a) => a.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return DEMO_ACTORS[0].id;
}

export function saveActorId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function actorById(id: string): Actor {
  return DEMO_ACTORS.find((a) => a.id === id) ?? DEMO_ACTORS[0];
}

export function formatActor(a: { name: string; role?: string | null }): string {
  return a.role ? `${a.name} · ${a.role}` : a.name;
}
