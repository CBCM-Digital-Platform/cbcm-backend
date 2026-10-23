const env = require('../config/env');
const AppError = require('../errors/app-error');
const { createLocalStorageProvider } = require('./local-storage.provider');
const { createS3StorageProvider } = require('./s3-storage.provider');

function getStorageProvider(options = {}) {
	const provider = String(options.provider || env.STORAGE_PROVIDER || 'local').trim().toLowerCase();
	if (provider === 'local') {
		return createLocalStorageProvider(options);
	}
	if (provider === 's3') {
		return createS3StorageProvider(options);
	}
	throw new AppError(
		`Unsupported storage provider "${provider}". Use STORAGE_PROVIDER=local or STORAGE_PROVIDER=s3.`,
		500,
		'STORAGE_NOT_CONFIGURED'
	);
}

module.exports = {
	getStorageProvider,
};
