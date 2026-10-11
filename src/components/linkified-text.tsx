import { Fragment } from 'react';

const URL = /(https?:\/\/[^\s<>"“”]+[^\s<>"“”.,;:!?)\]'])/g;

/** A link's text: no scheme, decoded, and cut short if it's long. */
function label(href: string): string {
  let text = href.replace(/^https?:\/\/(www\.)?/, '');
  try {
    text = decodeURI(text);
  } catch {
    // keep it encoded
  }
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/** Plain text with its web addresses turned into links (descriptions, comments). */
export function LinkifiedText({ text }: { text: string }) {
  return text.split(URL).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary hover:underline">
        {label(part)}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
