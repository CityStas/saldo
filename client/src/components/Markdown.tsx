import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

/**
 * The heading level a model's own headings should start at.
 *
 * The page already has an h1 (the chat title), so the top heading inside an
 * answer has to be an h2. Models are inconsistent about where they start:
 * `# Шаг 1` and `### Шаг 1` are equally common, and rendering the second one
 * as-is produces h1 -> h3 on the page, which is a heading-order failure in an
 * audit and a real problem for a screen reader, which announces the structure
 * it is given. Each message is therefore shifted so its shallowest heading
 * lands on h2, and the original level is kept as a class so the visual scale
 * still reflects what the model meant.
 */
const FIRST_HEADING_LEVEL = 2;

function headingOffset(markdown: string): number {
  const levels = [...markdown.matchAll(/^#{1,6}[ \t]/gm)].map(
    (match) => match[0].trimEnd().length,
  );

  if (levels.length === 0) return 0;
  return FIRST_HEADING_LEVEL - Math.min(...levels);
}

function headingComponents(offset: number): Components {
  const components: Components = {};

  for (let level = 1; level <= 6; level += 1) {
    // Clamped at both ends: never above h2 (the page's h1 is taken), never
    // below h6. A message that starts at h5 degenerates into two h2s rather
    // than inventing a level 7.
    const rendered = Math.min(6, Math.max(FIRST_HEADING_LEVEL, level + offset));
    const Tag = `h${rendered}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

    components[`h${level}` as 'h1'] = ({ children }) => (
      <Tag className={`md-h${level}`}>{children}</Tag>
    );
  }

  return components;
}

const baseComponents: Components = {
  // Code blocks get a chrome with a language label and a copy button;
  // inline code stays a plain <code>.
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children, ...rest }) {
    const text = String(children).replace(/\n$/, '');
    const match = /language-(\w+)/.exec(className ?? '');

    if (!match && !text.includes('\n')) {
      return (
        <code className="inline-code" {...rest}>
          {children}
        </code>
      );
    }

    return <CodeBlock code={text} language={match?.[1] ?? ''} />;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

/**
 * Markdown is a bonus in the assignment, but an unformatted answer looks
 * broken next to a styled UI. Streaming markdown is re-parsed on every token,
 * so this component is memoised on the text it receives.
 *
 * `remark-gfm` is what makes the `table` renderer above reachable: models emit
 * GitHub-flavoured tables constantly, and without the plugin they arrive as a
 * paragraph of raw pipes.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  const offset = headingOffset(children);

  const components = useMemo(
    () => ({ ...baseComponents, ...headingComponents(offset) }),
    [offset],
  );

  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
