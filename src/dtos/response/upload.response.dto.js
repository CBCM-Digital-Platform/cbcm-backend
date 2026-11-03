const toUpload = (record) => {
	const value = record?.get ? record.get({ plain: true }) : (record || {});
	return {
		id: value.id,
		ownerId: value.owner_id ?? value.ownerId ?? null,
		context: value.context || 'resource',
		originalName: value.original_name ?? value.originalName ?? null,
		mimeType: value.mime_type ?? value.mimeType ?? null,
		sizeBytes: Number(value.size_bytes ?? value.sizeBytes ?? 0),
		createdAt: value.created_at ?? value.createdAt ?? null,
	};
};

module.exports = { toUpload };
