/**
 * The three service lines from saldo.chat, plus the contact the site sends
 * every CTA to.
 *
 * The assistant is not asked to write this copy. It only emits a key
 * (`[[услуга: vat]]`) and the client looks the wording up here, so the chat
 * and the site never drift apart, and a wording change does not need a prompt
 * change.
 */

export const TELEGRAM_URL = 'https://t.me/m/vttG1pI1YTli';

export type ServiceKey = 'reporting' | 'documents' | 'vat';

export interface ServiceEntry {
  key: ServiceKey;
  /** Section title as it appears on the site. */
  title: string;
  /** One line, taken from the site's section description. */
  summary: string;
  /** Button label, matching the site's per-section CTA. */
  action: string;
}

export const SERVICES: Record<ServiceKey, ServiceEntry> = {
  reporting: {
    key: 'reporting',
    title: 'Отчётность и налоговый учёт',
    summary:
      'Проверка полноты исходных данных, сверка регистров, расчёт налогов по применяемому режиму, подготовка и сдача отчётности.',
    action: 'Обсудить отчётность',
  },
  documents: {
    key: 'documents',
    title: 'Расходы и первичные документы',
    summary:
      'Проверка договоров, актов, накладных и УПД, реестр недостающих документов, рекомендации по исправлению расхождений.',
    action: 'Проверить документы',
  },
  vat: {
    key: 'vat',
    title: 'Учёт входящего НДС',
    summary:
      'Проверка обязательных реквизитов счетов-фактур и УПД, сверка книги покупок и регистров, подготовка декларации по НДС.',
    action: 'Обсудить учёт НДС',
  },
};

export function isServiceKey(value: string): value is ServiceKey {
  return value === 'reporting' || value === 'documents' || value === 'vat';
}
