import { resolveTag, tagLabel, tagTone } from '../lib/tags';

export function Tag({
  tags,
  fixtureId,
  expectedOutcome,
  label,
}: {
  tags?: string[] | null;
  fixtureId?: string | null;
  expectedOutcome?: string | null;
  /** Override explícito (ej. policy version no es tag de trampa) */
  label?: string;
}) {
  const raw = label ?? resolveTag({ tags, fixtureId, expectedOutcome });
  const tone = label ? 'neutral' : tagTone(String(raw));
  const text = label ?? tagLabel(String(raw));
  return (
    <span className={`tag tag-${tone}`} title={String(raw)}>
      {text}
    </span>
  );
}
