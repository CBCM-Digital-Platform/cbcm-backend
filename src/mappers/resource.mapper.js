// src/mappers/resource.mapper.js
const { toResource } = require('../dtos/response/resource.response.dto');

module.exports = {
	toResponse: (resource) => toResource(resource),
	toDetailResponse: (resource) => toResource(resource),
	toListResponse: (resources = []) => resources.map(toResource),
};
