const { LandingPageContent } = require('../models');

function getContent() {
	return LandingPageContent.findByPk(1);
}

function saveContent(record, values, transaction) {
	return record.update(values, { transaction });
}

module.exports = { getContent, saveContent };
