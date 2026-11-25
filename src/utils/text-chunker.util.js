// Splits extracted document text into retrieval-sized chunks while trying to
// keep paragraphs, sentences, and section headings intact.

const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 150;

const HEADING_PATTERN = /^(#{1,6}\s+.+|(?:section|chapter|article|part)\s+\d+[^\n]*|\d+(?:\.\d+)*[.)]?\s+[A-Z][^\n]{2,80}|[A-Z][A-Z\s]{4,80}:?)\s*$/i;
const SENTENCE_END = /[.!?]["')\]]?\s+/g;

function normalizeText(text) {
	return String(text || '')
		.replace(/\r\n?/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function isHeadingLine(line) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.length > 120) return false;
	return HEADING_PATTERN.test(trimmed) || /^#{1,6}\s/.test(trimmed);
}

function cleanHeading(line) {
	return line.trim().replace(/^#{1,6}\s+/, '').replace(/[:\s]+$/, '');
}

function splitLongText(text, maxChars) {
	const pieces = [];
	let remaining = text;
	while (remaining.length > maxChars) {
		let cut = remaining.lastIndexOf('\n\n', maxChars);
		if (cut < maxChars * 0.4) cut = remaining.lastIndexOf('\n', maxChars);
		if (cut < maxChars * 0.4) cut = remaining.lastIndexOf(' ', maxChars);
		if (cut < maxChars * 0.3) cut = maxChars;
		pieces.push(remaining.slice(0, cut).trim());
		remaining = remaining.slice(cut).trim();
	}
	if (remaining) pieces.push(remaining);
	return pieces.filter(Boolean);
}

/**
 * Chunks normalized text into overlapping segments.
 * Returns [{ content, sectionHeading }]. Page numbers are not derivable from
 * plain text extraction and are left to the caller (null).
 */
function chunkText(text, { maxChars = DEFAULT_MAX_CHARS, overlapChars = DEFAULT_OVERLAP_CHARS } = {}) {
	const normalized = normalizeText(text);
	if (!normalized) return [];

	const paragraphs = normalized.split(/\n\n+/);
	const chunks = [];
	let current = '';
	let sectionHeading = null;

	const flush = () => {
		const content = current.trim();
		if (content) chunks.push({ content, sectionHeading });
		current = '';
	};

	for (const paragraph of paragraphs) {
		const lines = paragraph.split('\n');
		const headingLine = lines.length === 1 && isHeadingLine(lines[0]) ? lines[0] : null;
		const body = headingLine ? '' : paragraph;

		if (headingLine) {
			flush();
			sectionHeading = cleanHeading(headingLine);
			current = `${headingLine}\n`;
			continue;
		}

		if (!body) continue;

		const candidate = current ? `${current}\n\n${body}` : body;
		if (candidate.length <= maxChars) {
			current = candidate;
			continue;
		}

		flush();
		for (const piece of splitLongText(body, maxChars)) {
			const pieceWithHeading = sectionHeading && !piece.startsWith(sectionHeading)
				? `${sectionHeading}\n${piece}`
				: piece;
			for (const sub of splitLongText(pieceWithHeading, maxChars)) {
				chunks.push({ content: sub, sectionHeading });
			}
		}
		current = '';
	}
	flush();

	// Apply trailing overlap between consecutive chunks from the same section.
	if (overlapChars > 0 && chunks.length > 1) {
		for (let i = chunks.length - 1; i > 0; i -= 1) {
			if (chunks[i].sectionHeading !== chunks[i - 1].sectionHeading) continue;
			const prev = chunks[i - 1].content;
			const overlap = prev.slice(-overlapChars).trim();
			if (overlap && !chunks[i].content.startsWith(overlap)) {
				chunks[i] = { ...chunks[i], content: `${overlap}\n${chunks[i].content}` };
			}
		}
	}

	return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

module.exports = {
	chunkText,
	normalizeText,
	DEFAULT_MAX_CHARS,
	DEFAULT_OVERLAP_CHARS,
};
