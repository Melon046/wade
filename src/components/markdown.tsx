"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/**
 * Renders assistant output as Markdown with GitHub-flavoured extensions
 * (tables, task lists, strikethrough) and syntax-highlighted code blocks.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="wade-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
