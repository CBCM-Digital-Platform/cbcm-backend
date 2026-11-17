const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const NewsStatus = require('../enums/news-status.enum');
const createDto = require('../dtos/request/create-news.dto');
const updateDto = require('../dtos/request/update-news.dto');
const mapper = require('../mappers/news.mapper');
const repository = require('../repositories/news.repository');
const { logActivity } = require('../utils/activity-logger.util');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

function buildPagination(page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

function slugBase(title) {
	return String(title)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'news';
}

async function allocateSlug(title) {
	const base = slugBase(title);
	let slug = base;
	let suffix = 2;
	while (await repository.findBySlug(slug)) {
		slug = `${base}-${suffix}`;
		suffix += 1;
	}
	return slug;
}

function ensurePublishable(values, current = null) {
	const status = values.status === undefined ? current?.status : values.status;
	if (status === NewsStatus.PUBLISHED) {
		const content = values.content === undefined ? current?.content : values.content;
		if (typeof content !== 'string' || !content.trim()) {
			throw new AppError('Content is required before publishing news.', 400, 'VALIDATION_ERROR', ['Content is required before publishing news.']);
		}
		if (/<[^>]*>/.test(content)) {
			throw new AppError('Content must not contain HTML markup.', 400, 'VALIDATION_ERROR', ['Content must not contain HTML markup.']);
		}
	}
}

function publicationDate(values, current = null) {
	if (values.status !== NewsStatus.PUBLISHED) return values.published_at;
	if (values.published_at !== undefined && values.published_at !== null) return values.published_at;
	return current?.published_at || new Date();
}

function buildListResult(rows, count, pagination, mapItem) {
	return {
		items: rows.map(mapItem),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function listPublicNews({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, category } = {}) {
	const pagination = buildPagination(page, limit);
	const where = {
		status: NewsStatus.PUBLISHED,
		published_at: { [Op.lte]: new Date() },
	};
	if (category) where.category = category;
	const { count, rows } = await repository.findAndCountAll({
		where,
		limit: pagination.limit,
		offset: pagination.offset,
		order: [['published_at', 'DESC']],
	});
	return buildListResult(rows, count, pagination, mapper.toPublicCard);
}

async function getPublicNews(identifier) {
	const now = new Date();
	const news = /^\d+$/.test(String(identifier))
		? await repository.findPublicById(Number(identifier), now)
		: await repository.findPublicBySlug(identifier, now);
	if (!news) throw new AppError('News article was not found.', 404, 'NEWS_NOT_FOUND');
	return mapper.toPublicDetail(news);
}

async function listAdminNews({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT, status, search } = {}) {
	const pagination = buildPagination(page, limit);
	const where = {};
	if (status) where.status = status;
	if (search) {
		where[Op.and] = Sequelize.where(
			Sequelize.fn('LOWER', Sequelize.col('title')),
			Op.like,
			`%${search.toLowerCase()}%`
		);
	}
	const { count, rows } = await repository.findAndCountAll({
		where,
		limit: pagination.limit,
		offset: pagination.offset,
		order: [['updated_at', 'DESC']],
	});
	return buildListResult(rows, count, pagination, mapper.toAdminNews);
}

async function createNews(input, authorId) {
	const values = createDto.toCreateNewsDto(input);
	values.title = String(values.title).trim();
	values.status = values.status || NewsStatus.DRAFT;
	ensurePublishable(values);
	values.published_at = publicationDate(values);
	values.slug = await allocateSlug(values.title);
	values.author_id = authorId;

	let article;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			article = await sequelize.transaction((transaction) => repository.create(values, { transaction }));
			break;
		} catch (error) {
			if (error.name !== 'SequelizeUniqueConstraintError' || attempt === 4) {
				if (error.name === 'SequelizeUniqueConstraintError') {
					throw new AppError('A news article with this slug already exists.', 409, 'NEWS_SLUG_CONFLICT');
				}
				throw error;
			}
			values.slug = await allocateSlug(values.title);
		}
	}
	await logActivity({ actorId: authorId, action: 'news_created', entityType: 'news', entityId: article.id, metadata: { slug: article.slug } });
	return mapper.toAdminNews(article);
}

async function updateNews(id, input, actorId) {
	const current = await repository.findById(id);
	if (!current) throw new AppError('News article was not found.', 404, 'NEWS_NOT_FOUND');
	const values = updateDto.toUpdateNewsDto(input);
	if (!Object.keys(values).length) {
		throw new AppError('At least one editable field is required.', 400, 'VALIDATION_ERROR', ['At least one editable field is required.']);
	}
	if (values.title !== undefined) values.title = String(values.title).trim();
	ensurePublishable(values, current);
	if ((values.status || current.status) === NewsStatus.PUBLISHED) {
		values.published_at = publicationDate(values, current);
	}
	if (values.published_at === null) values.published_at = null;
	const updated = await sequelize.transaction((transaction) => repository.update(id, values, { transaction }));
	await logActivity({ actorId, action: 'news_updated', entityType: 'news', entityId: id, metadata: { slug: current.slug } });
	return mapper.toAdminNews(updated);
}

async function deleteNews(id, actorId) {
	const current = await repository.findById(id);
	if (!current) throw new AppError('News article was not found.', 404, 'NEWS_NOT_FOUND');
	await sequelize.transaction((transaction) => repository.destroy(id, { transaction }));
	await logActivity({ actorId, action: 'news_deleted', entityType: 'news', entityId: id, metadata: { slug: current.slug } });
	return { deleted: true };
}

module.exports = {
	listPublicNews,
	getPublicNews,
	listAdminNews,
	createNews,
	updateNews,
	deleteNews,
	slugBase,
};
