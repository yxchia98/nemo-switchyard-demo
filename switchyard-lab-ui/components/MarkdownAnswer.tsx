"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model output as safe GitHub-flavored Markdown.
 * react-markdown escapes raw HTML by default; rehype-raw is intentionally not
 * installed so model output cannot inject executable markup into the lab UI.
 */
export function MarkdownAnswer({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
