// Canonical mapping between quiz assessment_stage values and the assessment
// component they feed. assessment_component is a legacy column retained for
// historical rows; new writes use 'pre_test'/'post_test'.
const STAGE_TO_COMPONENT = Object.freeze({
	PRETEST: 'pre_test',
	POST_TEST: 'post_test',
});

const COMPONENT_TO_STAGE = Object.freeze({
	pre_test: 'PRETEST',
	post_test: 'POST_TEST',
	// Legacy component values.
	criteria: 'PRETEST',
	theory: 'POST_TEST',
});

function componentForStage(stage) {
	return STAGE_TO_COMPONENT[stage] || null;
}

function stageForComponent(component) {
	return COMPONENT_TO_STAGE[component] || null;
}

module.exports = { STAGE_TO_COMPONENT, COMPONENT_TO_STAGE, componentForStage, stageForComponent };
