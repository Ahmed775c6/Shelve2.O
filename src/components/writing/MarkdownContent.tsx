import type { ReactNode } from "react";

export function PlainMarkdown({ value }: { value: string }) {
  const blocks = value.split(/\n{2,}/).filter(Boolean);
  return <div className="writing-preview-copy">{blocks.map((block, index) => {
    const heading = block.match(/^#{1,3}\s+(.+)/);
    if (heading) return <h3 key={index}>{heading[1]}</h3>;
    if (block.trim() === "***") return <div className="writing-preview-break" key={index}>* * *</div>;
    if (block.startsWith(">")) return <blockquote key={index}>{block.replace(/^>\s?/gm, "")}</blockquote>;
    if (block.startsWith("- ") || block.startsWith("* ")) {
      return <ul key={index}>{block.split("\n").map((line, lineIndex) => <li key={lineIndex}>{line.replace(/^[-*]\s+/, "")}</li>)}</ul>;
    }
    return <p key={index}>{block}</p>;
  })}</div>;
}

export function AssistantMarkdown({ value }: { value: string }) {
  const renderInline = (line: string, keyPrefix: string): ReactNode[] => {
    const tokens = line.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return tokens.map((token, index) => {
      if (token.startsWith("`") && token.endsWith("`")) return <code key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</code>;
      if (token.startsWith("**") && token.endsWith("**")) return <strong key={`${keyPrefix}-${index}`}>{token.slice(2, -2)}</strong>;
      if (token.startsWith("*") && token.endsWith("*")) return <em key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</em>;
      return token;
    });
  };

  return <div className="assistant-markdown">{value.split(/\n{2,}/).map((block, index) => {
    if (/^#{1,3}\s/.test(block)) {
      const heading = block.match(/^(#{1,3})\s+([\s\S]+)/);
      if (heading) return <h4 key={index}>{renderInline(heading[2], `h${index}`)}</h4>;
    }
    if (/^(?:[-*]|\d+\.)\s+/m.test(block)) {
      const ordered = /^\d+\./.test(block);
      const items = block.split("\n").map((line) => line.replace(/^(?:[-*]|\d+\.)\s+/, ""));
      const ListTag = ordered ? "ol" : "ul";
      return <ListTag key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `l${index}-${itemIndex}`)}</li>)}</ListTag>;
    }
    if (block.startsWith(">")) return <blockquote key={index}>{renderInline(block.replace(/^>\s?/gm, ""), `q${index}`)}</blockquote>;
    return <p key={index}>{renderInline(block, `p${index}`)}</p>;
  })}</div>;
}
