// src/services/assignments.service.js
const { Assignment, User, Facility, MentorshipCycle, ThematicArea, CycleFacility, CycleThematicArea, sequelize } = require('../models');
const AppError = require('../errors/app-error');
const { canAccessFacility, canAccessUser } = require('../constants/roles.constants');
const AssignmentStatus = require('../enums/assignment-status.enum');
const repository = require('../repositories/assignments.repository');

const ASSIGNMENT_FIELDS = ['mentor_id', 'mentee_id', 'facility_id', 'cycle_id', 'thematic_area_id', 'priority_score', 'matching_reason'];

function toAssignmentResponse(assignment) {
	if (!assignment) return null;
	const value = assignment.toJSON ? assignment.toJSON() : assignment;
	return Object.fromEntries(
		['id', ...ASSIGNMENT_FIELDS, 'status', 'assigned_by', 'assigned_at', 'unassigned_at']
			.filter((field) => value[field] !== undefined)
			.map((field) => [field, value[field]])
	);
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listAssignments({ page = 1, limit = 20, mentor_id, mentee_id, facility_id, cycle_id, status }, actor) {
	console.log('Listing assignments with filters:', { page, limit, mentor_id, mentee_id, facility_id, cycle_id, status });
	console.log('Actor:', actor);

	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	} else if (facility_id) {
		// System Admin can filter by facility if specified
		where.facility_id = facility_id;
	}

	if (mentor_id) where.mentor_id = mentor_id;
	if (mentee_id) where.mentee_id = mentee_id;
	if (cycle_id) where.cycle_id = cycle_id;
	if (status) where.status = status;

	console.log('Where clause:', where);

	const pagination = buildPagination(page, limit);
	console.log('Pagination:', pagination);

	try {
		const { count, rows } = await repository.findManyWithIncludes(where, {
			order: [['id', 'ASC']],
			limit: pagination.limit,
			offset: pagination.offset,
		});

		console.log('Found assignments:', count);
		return {
			items: rows.map(toAssignmentResponse),
			total: count,
			page: pagination.page,
			limit: pagination.limit,
			totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
		};
	} catch (error) {
		console.error('Error in listAssignments:', error);
		throw error;
	}
}

async function getAssignment(id, actor) {
	const assignment = await repository.findWithIncludes(id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, assignment.facility_id)) {
		throw new AppError('You do not have permission to access this assignment.', 403, 'FORBIDDEN');
	}

	return toAssignmentResponse(assignment);
}

async function createAssignment(payload, actor) {
	const { mentor_id, mentee_id, facility_id, cycle_id, thematic_area_id, priority_score, matching_reason } = payload;

	console.log('Creating assignment with payload:', payload);
	console.log('Actor:', actor);

	// Validate mentor
	const mentor = await User.findByPk(mentor_id);
	console.log('Mentor found:', mentor ? mentor.id : null);
	if (!mentor) throw new AppError('Mentor was not found.', 404, 'MENTOR_NOT_FOUND');
	if (mentor.role !== 'mentor') throw new AppError('Selected user is not a mentor.', 400, 'INVALID_ROLE');
	if (mentor.status && mentor.status !== 'active') throw new AppError('Mentor account is not active.', 400, 'USER_INACTIVE');

	// Validate mentee
	const mentee = await User.findByPk(mentee_id);
	console.log('Mentee found:', mentee ? mentee.id : null);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');
	if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');
	if (mentee.status && mentee.status !== 'active') throw new AppError('Mentee account is not active.', 400, 'USER_INACTIVE');

	// Validate facility
	const facility = await Facility.findByPk(facility_id);
	console.log('Facility found:', facility ? facility.id : null);
	if (!facility) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');

	// Validate cycle
	const cycle = await MentorshipCycle.findByPk(cycle_id);
	console.log('Cycle found:', cycle ? cycle.id : null);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');

	// Validate facility belongs to cycle
<<<<<<< HEAD
	const cycleFacility = await CycleFacility.findOne({ where: { cycle_id, facility_id } });
=======
	const cycleFacility = await CycleFacility.findOne({ where: { cycle_id: cycle_id, facility_id } });
	console.log('Cycle facility found:', cycleFacility ? cycleFacility.id : null);
>>>>>>> origin/main
	if (!cycleFacility) throw new AppError('Facility is not assigned to this cycle.', 400, 'FACILITY_NOT_IN_CYCLE');

	// Validate mentee's facility matches assignment facility
	console.log('Mentee facility_id:', mentee.facility_id, 'Assignment facility_id:', facility_id);
	if (mentee.facility_id && mentee.facility_id !== facility_id) {
		throw new AppError('Mentee must belong to the assignment facility.', 400, 'MENTEE_FACILITY_MISMATCH');
	}

	// Validate mentor's facility matches assignment facility
	console.log('Mentor facility_id:', mentor.facility_id, 'Assignment facility_id:', facility_id);
	if (mentor.facility_id && mentor.facility_id !== facility_id) {
		throw new AppError('Mentor must belong to the assignment facility.', 400, 'MENTOR_FACILITY_MISMATCH');
	}

	// Validate thematic area if provided
	if (thematic_area_id) {
		const thematicArea = await ThematicArea.findByPk(thematic_area_id);
		console.log('Thematic area found:', thematicArea ? thematicArea.id : null);
		if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
<<<<<<< HEAD
		
		const cycleThematicArea = await CycleThematicArea.findOne({ where: { cycle_id, thematic_area_id } });
=======

		const cycleThematicArea = await CycleThematicArea.findOne({ where: { cycle_id: cycle_id, thematic_area_id } });
		console.log('Cycle thematic area found:', cycleThematicArea ? cycleThematicArea.id : null);
>>>>>>> origin/main
		if (!cycleThematicArea) throw new AppError('Thematic area is not assigned to this cycle.', 400, 'THEMATIC_AREA_NOT_IN_CYCLE');
	}

	// Enforce RBAC scope
	if (actor && actor.role === 'facility_admin') {
		if (!canAccessFacility(actor, facility_id)) {
			throw new AppError('You can only create assignments within your authorized facility.', 403, 'FORBIDDEN');
		}
	}

	// Check for duplicate active assignment
	const existing = await repository.findActiveAssignment(mentor_id, mentee_id, cycle_id);
	console.log('Existing assignment found:', existing ? existing.id : null);
	if (existing) {
		throw new AppError('An active assignment already exists for this mentor, mentee, and cycle.', 409, 'ASSIGNMENT_EXISTS');
	}

	const values = Object.fromEntries(ASSIGNMENT_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	values.status = AssignmentStatus.ASSIGNED;
	values.assigned_by = actor.id;
	values.assigned_at = new Date();

	console.log('Creating assignment with values:', values);
	const assignment = await sequelize.transaction((transaction) => repository.create(values, { transaction }));
	console.log('Assignment created:', assignment.id);
	return toAssignmentResponse(assignment);
}

async function updateAssignment(id, payload, actor) {
	const assignment = await repository.findById(id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, assignment.facility_id)) {
		throw new AppError('You do not have permission to update this assignment.', 403, 'FORBIDDEN');
	}

	const values = {};
	const editableFields = ['priority_score', 'matching_reason', 'thematic_area_id'];
	for (const field of editableFields) {
		if (Object.prototype.hasOwnProperty.call(payload, field)) {
			values[field] = payload[field];
		}
	}

	if (!Object.keys(values).length) {
		throw new AppError('At least one editable field is required.', 400, 'VALIDATION_ERROR');
	}

	// Validate thematic area if being updated
	if (values.thematic_area_id) {
		const thematicArea = await ThematicArea.findByPk(values.thematic_area_id);
		if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
		
		const cycleThematicArea = await CycleThematicArea.findOne({ where: { cycle_id: assignment.cycle_id, thematic_area_id: values.thematic_area_id } });
		if (!cycleThematicArea) throw new AppError('Thematic area is not assigned to this cycle.', 400, 'THEMATIC_AREA_NOT_IN_CYCLE');
	}

	const updated = await sequelize.transaction((transaction) => repository.update(id, values, { transaction }));
	return toAssignmentResponse(updated);
}

async function updateAssignmentStatus(id, newStatus, actor) {
	const assignment = await repository.findById(id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, assignment.facility_id)) {
		throw new AppError('You do not have permission to update this assignment.', 403, 'FORBIDDEN');
	}

	// Validate status transition
	const validTransitions = {
		[AssignmentStatus.PENDING_MATCH]: [AssignmentStatus.ASSIGNED, AssignmentStatus.CANCELLED],
		[AssignmentStatus.ASSIGNED]: [AssignmentStatus.COMPLETED, AssignmentStatus.CANCELLED],
		[AssignmentStatus.COMPLETED]: [],
		[AssignmentStatus.CANCELLED]: [],
		[AssignmentStatus.UNASSIGNED]: [AssignmentStatus.ASSIGNED],
	};

	if (!validTransitions[assignment.status]?.includes(newStatus)) {
		throw new AppError(`Cannot transition assignment from ${assignment.status} to ${newStatus}.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	const values = { status: newStatus };
	if (newStatus === AssignmentStatus.CANCELLED || newStatus === AssignmentStatus.UNASSIGNED) {
		values.unassigned_at = new Date();
	}

	const updated = await sequelize.transaction((transaction) => repository.update(id, values, { transaction }));
	return toAssignmentResponse(updated);
}

async function unassignAssignment(id, actor) {
	const assignment = await repository.findById(id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, assignment.facility_id)) {
		throw new AppError('You do not have permission to unassign this mentor-mentee pair.', 403, 'FORBIDDEN');
	}

	if (assignment.status === AssignmentStatus.CANCELLED || assignment.status === AssignmentStatus.UNASSIGNED) {
		throw new AppError('Assignment is already unassigned or cancelled.', 400, 'ASSIGNMENT_ALREADY_UNASSIGNED');
	}

	const values = { status: AssignmentStatus.CANCELLED, unassigned_at: new Date() };
	const updated = await sequelize.transaction((transaction) => repository.update(id, values, { transaction }));
	return toAssignmentResponse(updated);
}

async function getMenteeAssignments(menteeId, actor) {
	const mentee = await User.findByPk(menteeId);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');

	// Enforce scope: mentors can see their own mentees, mentees can see their own assignments
	if (actor) {
		if (actor.role === 'mentee' && actor.id !== menteeId) {
			throw new AppError('You can only view your own assignments.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'mentor' && !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view assignments for mentees within your facility.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view assignments for mentees within your facility.', 403, 'FORBIDDEN');
		}
	}

	const assignments = await repository.findByMenteeId(menteeId);
	return assignments.map(toAssignmentResponse);
}

async function getMentorAssignments(mentorId, actor) {
	const mentor = await User.findByPk(mentorId);
	if (!mentor) throw new AppError('Mentor was not found.', 404, 'MENTOR_NOT_FOUND');

	// Enforce scope: mentors can see their own assignments
	if (actor) {
		if (actor.role === 'mentor' && actor.id !== mentorId) {
			throw new AppError('You can only view your own assignments.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'facility_admin' && !canAccessUser(actor, mentor)) {
			throw new AppError('You can only view assignments for mentors within your facility.', 403, 'FORBIDDEN');
		}
	}

	const assignments = await repository.findByMentorId(mentorId);
	return assignments.map(toAssignmentResponse);
}

module.exports = {
	listAssignments,
	getAssignment,
	createAssignment,
	updateAssignment,
	updateAssignmentStatus,
	unassignAssignment,
	getMenteeAssignments,
	getMentorAssignments,
	toAssignmentResponse,
};
