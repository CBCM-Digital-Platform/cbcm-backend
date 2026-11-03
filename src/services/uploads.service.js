const AppError = require('../errors/app-error');
const { hasAnyRole, SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const storage = require('../providers/storage.provider');
const repository = require('../repositories/uploads.repository');
const { toUpload } = require('../dtos/response/upload.response.dto');
const { parseContext } = require('../validators/uploads.validator');

const requireUploadAccess = (file, actor) => {
	if (!file) throw new AppError('Uploaded file was not found.', 404, 'FILE_NOT_FOUND');
	if (hasAnyRole(actor?.role, SYSTEM_ADMIN_ROLES)) return;
	if (Number(file.owner_id) === Number(actor?.id)) return;
	throw new AppError('You do not have permission to access this file.', 403, 'FORBIDDEN');
};

const createUpload = async ({ actor, upload, context }) => {
	if (!upload?.body) throw new AppError('A file is required.', 400, 'FILE_REQUIRED');
	const provider = storage.getStorageProvider();
	const stored = await provider.store({ body: upload.body, mimeType: upload.mimeType });
	try {
		const record = await repository.create({
			owner_id: actor.id,
			context: parseContext(context),
			original_name: upload.originalName || null,
			storage_key: stored.storageKey,
			mime_type: stored.mimeType,
			size_bytes: stored.sizeBytes,
		});
		return toUpload(record);
	} catch (error) {
		await provider.remove(stored.storageKey).catch(() => {});
		throw error;
	}
};

const getUpload = async (id, actor) => {
	const file = await repository.findById(id);
	requireUploadAccess(file, actor);
	return toUpload(file);
};

const openUpload = async (id, actor) => {
	const file = await repository.findById(id);
	requireUploadAccess(file, actor);
	const opened = await storage.getStorageProvider().open(file.storage_key);
	return {
		...toUpload(file),
		stream: opened.stream,
		sizeBytes: opened.sizeBytes || Number(file.size_bytes || 0),
	};
};

const deleteUpload = async (id, actor) => {
	const file = await repository.findById(id);
	requireUploadAccess(file, actor);
	await storage.getStorageProvider().remove(file.storage_key);
	await repository.destroy(id);
	return { id, deleted: true };
};

module.exports = {
	createUpload,
	getUpload,
	openUpload,
	deleteUpload,
};
