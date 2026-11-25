const {
	UPLOAD_FIELD_NAME,
	inspectUploadedFile,
	mapMulterError,
	resourceUpload,
	examCsvUpload,
	inspectExamCsvUpload,
} = require('../config/multer');

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

function uploadExamCsvFile(req, res, next) {
	examCsvUpload.single(UPLOAD_FIELD_NAME)(req, res, (error) => {
		if (error) return next(mapMulterError(error));
		try {
			req.examCsvUpload = inspectExamCsvUpload(req.file);
			return next();
		} catch (validationError) {
			return next(validationError);
		}
	});
}

module.exports = {
	uploadResourceFile,
	uploadExamCsvFile,
};
