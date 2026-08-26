export type PaceAnswerBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: Array<{ text: string; details: string[] }> }
  | { kind: "ordered-list"; items: string[] };

const heading = /^(#{1,6})\s+(.+)$/;
const unorderedItem = /^(\s*)[-•]\s+(.+)$/;
const orderedItem = /^\d+[.)]\s+(.+)$/;

/** Convert the small, deliberately supported Pace Markdown subset into safe UI blocks. */
export const parsePaceAnswer = (answer: string): PaceAnswerBlock[] => {
  const lines = answer.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PaceAnswerBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(heading);
    if (headingMatch) {
      blocks.push({ kind: "heading", text: headingMatch[2].trim() });
      index += 1;
      continue;
    }

    const firstUnorderedItem = lines[index].match(unorderedItem);
    if (firstUnorderedItem && firstUnorderedItem[1].length === 0) {
      const items: Array<{ text: string; details: string[] }> = [];
      while (index < lines.length) {
        const match = lines[index].match(unorderedItem);
        if (!match || match[1].length > 0) break;
        const item = { text: match[2].trim(), details: [] as string[] };
        index += 1;
        while (index < lines.length) {
          const detail = lines[index].match(unorderedItem);
          if (!detail || detail[1].length === 0) break;
          item.details.push(detail[2].trim());
          index += 1;
        }
        items.push(item);
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (orderedItem.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(orderedItem);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || heading.test(next) || unorderedItem.test(lines[index]) || orderedItem.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
};
