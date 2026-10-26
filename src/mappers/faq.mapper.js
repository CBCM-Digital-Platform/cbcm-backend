// src/mappers/faq.mapper.js
const faqResponseDto = require('../dtos/response/faq.response.dto');

module.exports = {
	toResponse: (faq) => faqResponseDto.fromModel(faq),
};
