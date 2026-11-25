const LearningMaterialCategory = require('../enums/learning-material-category.enum');
const LearningMaterialFormat = require('../enums/learning-material-format.enum');

const formats = Object.values(LearningMaterialFormat);
const MATERIAL_FORMATS_BY_CATEGORY = Object.freeze({
	[LearningMaterialCategory.PARTICIPANT_MANUAL]: Object.freeze([...formats]),
	[LearningMaterialCategory.POWERPOINT_PRESENTATION]: Object.freeze([...formats]),
	[LearningMaterialCategory.FACILITATOR_GUIDE]: Object.freeze([...formats]),
	[LearningMaterialCategory.EXAMINATION]: Object.freeze([LearningMaterialFormat.PDF]),
	[LearningMaterialCategory.ANSWER_KEY]: Object.freeze([LearningMaterialFormat.PDF]),
});

const isMaterialFormatCompatible = (category, format) => (
	MATERIAL_FORMATS_BY_CATEGORY[category]?.includes(format) || false
);

module.exports = {
	MATERIAL_FORMATS_BY_CATEGORY,
	isMaterialFormatCompatible,
};
