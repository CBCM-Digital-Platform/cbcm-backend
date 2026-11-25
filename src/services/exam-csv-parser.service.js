const { parse } = require('csv-parse/sync');
const { REQUIRED_HEADERS, validationError } = require('../validators/exam-import.validator');

function parseHeader(text) {
	try {
		return parse(text, {
			bom: true,
			to_line: 1,
			relax_column_count: true,
			skip_empty_lines: false,
		});
	} catch (error) {
		throw validationError([{ row: 1, field: 'header', message: `Malformed CSV header: ${error.message}` }]);
	}
}

function normalizeHeaders(rawHeaders) {
	const headers = rawHeaders.map((header) => String(header ?? '').trim().toLowerCase());
	const details = [];
	const seen = new Set();
	for (const header of headers) {
		if (!header) details.push({ row: 1, field: 'header', message: 'Header names must not be empty.' });
		if (seen.has(header)) details.push({ row: 1, field: header, message: 'Duplicate header is not allowed.' });
		seen.add(header);
	}
	const missing = REQUIRED_HEADERS.filter((header) => !seen.has(header));
	const unsupported = headers.filter((header) => !REQUIRED_HEADERS.includes(header));
	for (const header of missing) details.push({ row: 1, field: header, message: `Required header is missing: ${header}.` });
	for (const header of unsupported) details.push({ row: 1, field: header, message: `Unsupported header: ${header}.` });
	if (details.length) throw validationError(details);
	return headers;
}

function parseRows(text, headers) {
	try {
		return parse(text, {
			bom: true,
			columns: headers,
			from_line: 2,
			skip_empty_lines: true,
			relax_column_count: false,
			skip_records_with_error: false,
			trim: false,
		});
	} catch (error) {
		const row = Number(error.lines || error.line || 2);
		throw validationError([{ row, field: 'row', message: `Malformed CSV row: ${error.message}` }]);
	}
}

function parseExamCsv(buffer) {
	const text = Buffer.from(buffer || '').toString('utf8');
	if (!text.trim()) throw validationError([{ row: 1, field: 'file', message: 'The CSV file contains no data.' }]);
	const headerRows = parseHeader(text);
	if (!headerRows.length || !headerRows[0]?.length) {
		throw validationError([{ row: 1, field: 'header', message: 'CSV headers are required.' }]);
	}
	const headers = normalizeHeaders(headerRows[0]);
	const records = parseRows(text, headers);
	const details = [];
	const rows = [];
	const choices = ['A', 'B', 'C', 'D'];

	records.forEach((record, index) => {
		const rowNumber = index + 2;
		const question = String(record.question ?? '').trim();
		const options = Object.fromEntries(choices.map((choice) => [choice, String(record[`option_${choice.toLowerCase()}`] ?? '').trim()]));
		const correctAnswer = String(record.correct_answer ?? '').trim().toUpperCase();
		const marksText = String(record.marks ?? '').trim();
		const marks = Number(marksText);
		if (!question) details.push({ row: rowNumber, field: 'question', message: 'Question text is required.' });
		for (const choice of choices) {
			if (!options[choice]) details.push({ row: rowNumber, field: `option_${choice.toLowerCase()}`, message: `Option ${choice} is required.` });
		}
		if (!choices.includes(correctAnswer)) details.push({ row: rowNumber, field: 'correct_answer', message: 'Correct answer must be A, B, C, or D.' });
		if (!Number.isFinite(marks) || marks <= 0) details.push({ row: rowNumber, field: 'marks', message: 'Marks must be a number greater than zero.' });
		if (question && choices.every((choice) => options[choice]) && choices.includes(correctAnswer) && Number.isFinite(marks) && marks > 0) {
			rows.push({ question, options, correctAnswer, marks });
		}
	});

	if (!records.length) details.push({ row: 2, field: 'file', message: 'The CSV must contain at least one question.' });
	if (details.length) throw validationError(details.slice(0, 500));
	if (!rows.length) throw validationError([{ row: 2, field: 'file', message: 'The CSV contains no valid questions.' }]);
	return rows;
}

module.exports = { parseExamCsv };
