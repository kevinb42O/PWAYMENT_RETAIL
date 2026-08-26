export type PaceAnswerBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] };

const heading = /^(#{1,3})\s+(.+)$/;
const unorderedItem = /^[-•]\s+(.+)$/;
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

    if (unorderedItem.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(unorderedItem);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
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
      if (!next || heading.test(next) || unorderedItem.test(next) || orderedItem.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
};
