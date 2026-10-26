// src/mappers/user-guide.mapper.js
const userGuideResponseDto = require('../dtos/response/user-guide.response.dto');

module.exports = {
	toResponse: (guide) => userGuideResponseDto.fromModel(guide),
};
