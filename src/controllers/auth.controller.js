// src/controllers/auth.controller.js
const { matchedData } = require('express-validator');
const authService = require('../services/auth.service');
const { errorResponse, successResponse } = require('../utils/response.util');

async function login(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.login({
      email: payload.email,
      password: payload.password,
      deviceInfo: req.headers['user-agent'] || null,
    });
    return successResponse(res, 200, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Authentication failed.');
  }
}

async function refreshToken(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.refreshToken({ refreshToken: payload.refreshToken });
    return successResponse(res, 200, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Token refresh failed.');
  }
}

async function logout(req, res) {
  try {
    const result = await authService.logout({
      user: req.user,
      refreshToken: req.body?.refreshToken || req.headers?.['x-refresh-token'] || null,
    });
    return successResponse(res, 200, result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Logout failed.');
  }
}

async function forgotPassword(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.forgotPassword({ email: payload.email });
    return successResponse(res, 200, result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Password reset request failed.');
  }
}

async function resetPassword(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.resetPassword({ token: payload.token, password: payload.password });
    return successResponse(res, 200, result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Password reset failed.');
  }
}

async function changePassword(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.changePassword({
      user: req.user,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });
    return successResponse(res, 200, result);
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Password change failed.');
  }
}

async function getSession(req, res) {
  try {
    const result = await authService.getSession(req.user.id);
    return successResponse(res, 200, { user: result });
  } catch (error) {
    return errorResponse(res, error.statusCode || 500, error.code || 'AUTH_ERROR', error.message || 'Session lookup failed.');
  }
}

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getSession,
};
