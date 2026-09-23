import { TelegramButton } from './TelegramButton';
import { SERVICES, type ServiceKey } from '../lib/services';

interface Props {
  service: ServiceKey;
}

/**
 * Rendered when the assistant decides the question needs work under a contract
 * rather than a consultation. The wording is not generated: the model only
 * picks a section, and the copy comes from the site.
 */
export function ServiceCta({ service }: Props) {
  const entry = SERVICES[service];

  return (
    <aside className="service-cta" aria-label="Услуга по договору">
      <p className="service-cta__kicker">Услуга по договору</p>
      <p className="service-cta__title">{entry.title}</p>
      <p className="service-cta__summary">{entry.summary}</p>
      <TelegramButton size="md" arrow label={entry.action} />
    </aside>
  );
}
