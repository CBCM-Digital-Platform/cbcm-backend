const {
	UPLOAD_FIELD_NAME,
	inspectUploadedFile,
	mapMulterError,
	resourceUpload,
	quizPdfUpload,
} = require('../config/multer');
const AppError = require('../errors/app-error');

function uploadResourceFile(req, res, next) {
	resourceUpload.single(UPLOAD_FIELD_NAME)(req, res, (error) => {
		if (error) return next(mapMulterError(error));
		try {
			req.resourceUpload = inspectUploadedFile(req.file);
			return next();
		} catch (validationError) {
			return next(validationError);
		}
	});
}

function uploadQuizPdfs(req, res, next) {
	quizPdfUpload.fields([{ name: 'questionPdf', maxCount: 1 }, { name: 'answerKeyPdf', maxCount: 1 }])(req, res, (error) => {
		if (error) return next(mapMulterError(error));
		try {
			const files = req.files || {};
			const question = files.questionPdf?.[0];
			if (!question) throw new AppError('questionPdf is required.', 400, 'FILE_REQUIRED');
			const answerKey = files.answerKeyPdf?.[0];
			const inspectedQuestion = inspectUploadedFile(question);
			const inspectedAnswerKey = answerKey ? inspectUploadedFile(answerKey) : null;
			if (inspectedQuestion.kind !== 'pdf' || (inspectedAnswerKey && inspectedAnswerKey.kind !== 'pdf')) {
				throw new AppError('Quiz imports accept PDF files only.', 400, 'FILE_TYPE_UNSUPPORTED');
			}
			req.quizPdfs = { question: inspectedQuestion, answerKey: inspectedAnswerKey };
			return next();
		} catch (validationError) {
			return next(validationError);
		}
	});
}

module.exports = {
	uploadResourceFile,
	uploadQuizPdfs,
};
