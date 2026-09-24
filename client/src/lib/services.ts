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

/** Copy for one service line. */
export interface ServiceEntry {
  /** Section title as it appears on the site. */
  title: string;
  /** One line, taken from the site's section description. */
  summary: string;
  /** Button label, matching the site's per-section CTA. */
  action: string;
}

export const SERVICES = {
  reporting: {
    title: 'Отчётность и налоговый учёт',
    summary:
      'Проверка полноты исходных данных, сверка регистров, расчёт налогов по применяемому режиму, подготовка и сдача отчётности.',
    action: 'Обсудить отчётность',
  },
  documents: {
    title: 'Расходы и первичные документы',
    summary:
      'Проверка договоров, актов, накладных и УПД, реестр недостающих документов, рекомендации по исправлению расхождений.',
    action: 'Проверить документы',
  },
  vat: {
    title: 'Учёт входящего НДС',
    summary:
      'Проверка обязательных реквизитов счетов-фактур и УПД, сверка книги покупок и регистров, подготовка декларации по НДС.',
    action: 'Обсудить учёт НДС',
  },
} satisfies Record<string, ServiceEntry>;

/**
 * The keys the assistant may emit, derived from the table above rather than
 * listed again next to it. The union, the record and the type guard used to be
 * three separate copies of the same three strings, which is three places to
 * forget when a fourth service appears.
 */
export type ServiceKey = keyof typeof SERVICES;

export function isServiceKey(value: string): value is ServiceKey {
  return Object.hasOwn(SERVICES, value);
}
