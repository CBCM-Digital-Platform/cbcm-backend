const { matchedData } = require('express-validator');
const authService = require('../services/auth.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function getCurrentUser(req, res) {
  try {
    const user = await authService.getUserProfile(req.user.id);
    return successResponse(res, 200, user);
  } catch (error) {
    return controllerError(res, error, 'Unable to load the profile.');
  }
}

async function updateCurrentUser(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const user = await authService.updateUserProfile(req.user.id, payload);
    return successResponse(res, 200, user);
  } catch (error) {
    return controllerError(res, error, 'Unable to update the profile.');
  }
}

async function updateCurrentUserPreferences(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const preferences = await authService.updateUserPreferences(req.user.id, payload);
    return successResponse(res, 200, preferences);
  } catch (error) {
    return controllerError(res, error, 'Unable to update preferences.');
  }
}

async function getCurrentUserPreferences(req, res) {
  try {
    const preferences = await authService.getUserPreferences(req.user.id);
    return successResponse(res, 200, preferences);
  } catch (error) {
    return controllerError(res, error, 'Unable to load preferences.');
  }
}

async function listUsers(req, res) {
  try {
    const payload = matchedData(req, { locations: ['query'] });
    const data = await authService.listUsers({
      page: payload.page || 1,
      limit: payload.limit || 20,
      role: payload.role,
      status: payload.status,
      facilityId: payload.facilityId,
    }, req.user);
    return successResponse(res, 200, data.items, { page: data.page, limit: data.limit, total: data.total, totalPages: data.totalPages });
  } catch (error) {
    return controllerError(res, error, 'Unable to list users.');
  }
}

async function getUserById(req, res) {
  try {
    const user = await authService.getUserByIdForAdmin(Number(req.params.id), req.user);
    return successResponse(res, 200, user);
  } catch (error) {
    return controllerError(res, error, 'Unable to load the user.');
  }
}

async function createUser(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const user = await authService.createUserByAdmin({ ...payload, created_by: req.user.id });
    return successResponse(res, 201, user);
  } catch (error) {
    return controllerError(res, error, 'Unable to create the user.');
  }
}

async function updateUserStatus(req, res) {
  try {
    const { status } = matchedData(req, { locations: ['body'] });
    const user = await authService.updateUserStatus(Number(req.params.id), status, req.user.id);
    return successResponse(res, 200, user);
  } catch (error) {
    return controllerError(res, error, 'Unable to update user status.');
  }
}

module.exports = {
  getCurrentUser,
  updateCurrentUser,
  updateCurrentUserPreferences,
  getCurrentUserPreferences,
  listUsers,
  getUserById,
  createUser,
  updateUserStatus,
};
