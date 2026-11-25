const { Op } = require('sequelize');
const { Exam, ExamQuestion, ExamOption, ThematicArea, MentorshipCycle, CycleThematicArea, CycleFacility, Assignment } = require('../models');

function findThematicArea(id, options = {}) {
	return ThematicArea.findByPk(id, options);
}

function findCycle(id, options = {}) {
	return MentorshipCycle.findByPk(id, options);
}

function findCycleThematicArea(cycleId, thematicAreaId, options = {}) {
	return CycleThematicArea.findOne({ where: { cycle_id: cycleId, thematic_area_id: thematicAreaId }, transaction: options });
}

function findDuplicate({ thematicAreaId, cycleId, stage, version }, transaction) {
	return Exam.findOne({ where: { thematic_area_id: thematicAreaId, cycle_id: cycleId, stage, version }, transaction });
}

function createExam(data, transaction) {
	return Exam.create(data, { transaction });
}

function createQuestion(data, transaction) {
	return ExamQuestion.create(data, { transaction });
}

function createOptions(data, transaction) {
	return ExamOption.bulkCreate(data, { transaction });
}

function findExamById(id) {
	return Exam.findByPk(id, {
		attributes: ['id', 'title', 'stage', 'cycle_id', 'thematic_area_id', 'version', 'is_published', 'is_authorized'],
	});
}

function updateExamStatus(id, values) {
	return Exam.update(values, { where: { id }, returning: true });
}

function cycleScopeInclude(facilityId) {
	return {
		model: MentorshipCycle,
		as: 'cycle',
		attributes: ['id', 'name', 'status'],
		...(facilityId == null ? {} : {
			required: true,
			include: [{ model: CycleFacility, as: 'cycleFacilitiesForFilter', attributes: [], where: { facility_id: facilityId }, required: true }],
		}),
	};
}

function findExams({ facilityId } = {}) {
	return Exam.findAll({
		attributes: ['id', 'title', 'description', 'stage', 'cycle_id', 'thematic_area_id', 'version', 'total_questions', 'total_marks', 'is_published', 'is_authorized'],
		include: [cycleScopeInclude(facilityId), { model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'] }],
		order: [['created_at', 'DESC'], ['id', 'DESC']],
	});
}

function findExamDetailsById(id, { facilityId } = {}) {
	return Exam.findOne({
		where: { id },
		attributes: ['id', 'title', 'description', 'stage', 'cycle_id', 'thematic_area_id', 'version', 'total_questions', 'total_marks', 'is_published', 'is_authorized'],
		include: [cycleScopeInclude(facilityId), { model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'] }, {
			model: ExamQuestion,
			as: 'questions',
			attributes: ['id', 'question_text', 'question_type', 'marks', 'order_number'],
			include: [{ model: ExamOption, as: 'options', attributes: ['id', 'option_label', 'option_text'] }],
		}],
		order: [[{ model: ExamQuestion, as: 'questions' }, 'order_number', 'ASC'], [{ model: ExamQuestion, as: 'questions' }, { model: ExamOption, as: 'options' }, 'option_label', 'ASC']],
	});
}

function findMentorExamAssignment({ mentorId, cycleId, thematicAreaId }) {
	return Assignment.findOne({ where: { mentor_id: mentorId, cycle_id: cycleId, thematic_area_id: thematicAreaId, status: { [Op.in]: ['assigned', 'active'] }, unassigned_at: null }, attributes: ['id'] });
}

function findMenteeExamAssignment({ menteeId, cycleId, thematicAreaId, facilityId }) {
	return Assignment.findOne({
		where: {
			mentee_id: menteeId,
			cycle_id: cycleId,
			thematic_area_id: thematicAreaId,
			facility_id: facilityId,
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
		},
		attributes: ['id', 'mentee_id', 'facility_id', 'cycle_id', 'thematic_area_id'],
	});
}

function findPublishedExams({ cycleId, thematicAreaId, stage }) {
	return Exam.findAll({
		where: {
			cycle_id: cycleId,
			thematic_area_id: thematicAreaId,
			stage,
			is_published: true,
			is_authorized: true,
		},
		attributes: [
			'id', 'title', 'description', 'stage', 'cycle_id', 'thematic_area_id',
			'version', 'total_questions', 'total_marks', 'is_published', 'is_authorized',
		],
		include: [{
			model: ExamQuestion,
			as: 'questions',
			required: true,
			attributes: ['id', 'question_text', 'marks', 'order_number'],
			include: [{
				model: ExamOption,
				as: 'options',
				required: true,
				attributes: ['id', 'option_label', 'option_text'],
			}],
		}],
		order: [
			['version', 'DESC'],
			[{ model: ExamQuestion, as: 'questions' }, 'order_number', 'ASC'],
			[{ model: ExamQuestion, as: 'questions' }, { model: ExamOption, as: 'options' }, 'option_label', 'ASC'],
		],
	});
}

module.exports = {
	findThematicArea,
	findCycle,
	findCycleThematicArea,
	findDuplicate,
	createExam,
	createQuestion,
	createOptions,
	findExamById,
	updateExamStatus,
	findExams,
	findExamDetailsById,
	findMentorExamAssignment,
	findMenteeExamAssignment,
	findPublishedExams,
};
