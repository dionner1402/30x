/** Ola de corrida del agente (hora local informativa; ejecución manual o cron futuro). */
export type AgentWaveConfig = {
  id: string;
  label: string;
  /** HH:mm — referencia para operación / demo (sin cron en MVP). */
  timeLocal: string;
  /**
   * Categorías `paymentCategory` a procesar en esta ola.
   * `*` = todo lo pendiente que quede tras olas anteriores.
   */
  categories: string[];
};

export const DEFAULT_AGENT_WAVES: AgentWaveConfig[] = [
  {
    id: 'general',
    label: 'General + operaciones',
    timeLocal: '13:00',
    categories: ['general', 'ops'],
  },
  {
    id: 'suppliers',
    label: 'Proveedores',
    timeLocal: '14:00',
    categories: ['suppliers'],
  },
  {
    id: 'rest',
    label: 'Servicios, nómina y resto',
    timeLocal: '15:00',
    categories: ['*'],
  },
];
