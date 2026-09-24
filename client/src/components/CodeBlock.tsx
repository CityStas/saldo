import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard permission denied - the code is still selectable by hand.
    }
  };

  return (
    <div className="code">
      <div className="code__bar">
        <span className="code__lang">{language || 'text'}</span>
        <button
          type="button"
          className="code__copy"
          onClick={() => void copy()}
          aria-label={copied ? 'Скопировано' : 'Скопировать код'}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span>{copied ? 'Скопировано' : 'Копировать'}</span>
        </button>
      </div>
      <pre className="code__body">
        <code>{code}</code>
      </pre>
    </div>
  );
}
