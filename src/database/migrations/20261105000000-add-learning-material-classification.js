'use strict';

const { Op } = require('sequelize');
const TABLE = 'learning_module_contents';
const CONSTRAINT = 'ck_learning_module_contents_material_structure';
const CATEGORIES = [
	'PARTICIPANT_MANUAL',
	'POWERPOINT_PRESENTATION',
	'FACILITATOR_GUIDE',
	'EXAMINATION',
	'ANSWER_KEY',
];
const FORMATS = ['PDF', 'VIDEO', 'AUDIO', 'LINK', 'PPT', 'PPTX'];
const FILE_FORMATS = FORMATS.filter((format) => format !== 'LINK');
const MULTIFORMAT_CATEGORIES = ['PARTICIPANT_MANUAL', 'POWERPOINT_PRESENTATION', 'FACILITATOR_GUIDE'];

module.exports = {
	async up(queryInterface, Sequelize) {
		const columns = await queryInterface.describeTable(TABLE);
		if (!columns.category) {
			await queryInterface.addColumn(TABLE, 'category', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
		if (!columns.format) {
			await queryInterface.addColumn(TABLE, 'format', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
		if (!columns.assessment_stage) {
			await queryInterface.addColumn(TABLE, 'assessment_stage', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}

		const constraints = await queryInterface.showConstraint(TABLE);
		if (!constraints.some((constraint) => constraint.constraintName === CONSTRAINT)) {
			await queryInterface.addConstraint(TABLE, {
				fields: ['category', 'format', 'assessment_stage', 'file_id', 'content_url'],
				type: 'check',
				name: CONSTRAINT,
				where: {
					[Op.or]: [
						{ [Op.and]: [{ category: null }, { format: null }, { assessment_stage: null }] },
						{
							[Op.and]: [
								{ category: { [Op.ne]: null } },
								{ format: { [Op.ne]: null } },
								{ category: { [Op.in]: CATEGORIES } },
								{ format: { [Op.in]: FORMATS } },
								{
									[Op.or]: [
										{ category: { [Op.in]: MULTIFORMAT_CATEGORIES } },
										{
											[Op.and]: [
												{ category: { [Op.in]: ['EXAMINATION', 'ANSWER_KEY'] } },
												{ format: 'PDF' },
											],
										},
									],
								},
								{
									[Op.or]: [
										{
											[Op.and]: [
												{ category: 'EXAMINATION' },
												{ assessment_stage: { [Op.ne]: null } },
												{ assessment_stage: { [Op.in]: ['PRETEST', 'POST_TEST'] } },
											],
										},
										{
											[Op.and]: [
												{ category: { [Op.ne]: 'EXAMINATION' } },
												{ assessment_stage: null },
											],
										},
									],
								},
								{
									[Op.or]: [
										{
											[Op.and]: [
												{ format: 'LINK' },
												{ file_id: null },
												{ content_url: { [Op.ne]: null } },
											],
										},
										{
											[Op.and]: [
												{ format: { [Op.in]: FILE_FORMATS } },
												{ file_id: { [Op.ne]: null } },
												{ content_url: null },
											],
										},
									],
								},
							],
						},
					],
				},
			});
		}
	},

	async down(queryInterface) {
		const constraints = await queryInterface.showConstraint(TABLE);
		if (constraints.some((constraint) => constraint.constraintName === CONSTRAINT)) {
			await queryInterface.removeConstraint(TABLE, CONSTRAINT);
		}
		const columns = await queryInterface.describeTable(TABLE);
		if (columns.assessment_stage) await queryInterface.removeColumn(TABLE, 'assessment_stage');
		if (columns.format) await queryInterface.removeColumn(TABLE, 'format');
		if (columns.category) await queryInterface.removeColumn(TABLE, 'category');
	},
};
