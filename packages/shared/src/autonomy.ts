import { z } from 'zod';

/**
 * Escalera de autonomía (menos → más):
 * advise → assist → autopilot
 *
 * Alias legacy aceptados en API/DB: advisor, collaborator, operator.
 */
export const AutonomyModeSchema = z.enum(['advise', 'assist', 'autopilot']);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

const LEGACY_TO_CANONICAL: Record<string, AutonomyMode> = {
  advise: 'advise',
  assist: 'assist',
  autopilot: 'autopilot',
  advisor: 'advise',
  collaborator: 'assist',
  operator: 'autopilot',
};

export function normalizeAutonomyMode(
  raw: string | null | undefined,
): AutonomyMode {
  if (!raw || !String(raw).trim()) return 'autopilot';
  const key = String(raw).trim().toLowerCase();
  return LEGACY_TO_CANONICAL[key] ?? 'autopilot';
}

/** Zod: acepta canónicos + legacy y emite canónico. */
export const AutonomyModeInputSchema = z.preprocess(
  (v) => normalizeAutonomyMode(typeof v === 'string' ? v : undefined),
  AutonomyModeSchema,
);

export const AUTONOMY_LADDER: Array<{
  mode: AutonomyMode;
  labelEn: string;
  labelEs: string;
  blurb: string;
}> = [
  {
    mode: 'advise',
    labelEn: 'Advise',
    labelEs: 'Asesor',
    blurb: 'Recomienda · humano confirma siempre',
  },
  {
    mode: 'assist',
    labelEn: 'Assist',
    labelEs: 'Asistido',
    blurb: 'Auto-PAY hasta soft cap',
  },
  {
    mode: 'autopilot',
    labelEn: 'Autopilot',
    labelEs: 'Autónomo',
    blurb: 'Auto-PAY hasta hard cap',
  },
];
