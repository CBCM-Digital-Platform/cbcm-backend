// src/utils/response.util.js
function successResponse(res, statusCode, data = {}, meta = {}) {
  return res.status(statusCode).json({ success: true, data, meta });
}

function errorResponse(res, statusCode, code, message, details = []) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

module.exports = {
  successResponse,
  errorResponse,
};
