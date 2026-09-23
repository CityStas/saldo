import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

const components: Components = {
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
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
