// src/controllers/auth.controller.js
const { matchedData } = require('express-validator');
const authService = require('../services/auth.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

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
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      user: result.user,
    });
  } catch (error) {
    return controllerError(res, error, 'Authentication failed.');
  }
}

async function refreshToken(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.refreshToken({ refreshToken: payload.refreshToken });
    return successResponse(res, 200, {
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      user: result.user,
    });
  } catch (error) {
    return controllerError(res, error, 'Token refresh failed.');
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
    return controllerError(res, error, 'Logout failed.');
  }
}

async function forgotPassword(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.forgotPassword({ email: payload.email });
    return successResponse(res, 200, result);
  } catch (error) {
    return controllerError(res, error, 'Password reset request failed.');
  }
}

async function forgotOtp(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.forgotOtp({ email: payload.email });
    return successResponse(res, 200, result);
  } catch (error) {
    return controllerError(res, error, 'OTP request failed.');
  }
}

async function resetPassword(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.resetPassword({
      token: payload.token,
      password: payload.new_password ?? payload.password,
      newPassword: payload.new_password,
      confirmPassword: payload.confirm_password ?? payload.password,
    });
    return successResponse(res, 200, result);
  } catch (error) {
    return controllerError(res, error, 'Password reset failed.');
  }
}

async function resetOtp(req, res) {
  try {
    const payload = matchedData(req, { locations: ['body'] });
    const result = await authService.resetOtp({
      email: payload.email,
      otp: payload.otp,
      newPassword: payload.new_password,
      confirmPassword: payload.confirm_password,
    });
    return successResponse(res, 200, result);
  } catch (error) {
    return controllerError(res, error, 'OTP reset failed.');
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
    return controllerError(res, error, 'Password change failed.');
  }
}

async function getSession(req, res) {
  try {
    const result = await authService.getSession(req.user.id);
    return successResponse(res, 200, { user: result });
  } catch (error) {
    return controllerError(res, error, 'Session lookup failed.');
  }
}

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  forgotOtp,
  resetPassword,
  resetOtp,
  changePassword,
  getSession,
};
