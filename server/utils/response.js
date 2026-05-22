/**
 * 统一 API 响应格式
 * { code: 0, data: {...}, message: 'ok' }
 */

// 成功
function ok(data = null, message = 'ok') {
  return { code: 0, data, message };
}

// 业务错误
function fail(message, code = 40001, data = null) {
  return { code, data, message };
}

// 未登录
function unauthorized(message = '未登录') {
  return { code: 40100, data: null, message };
}

// token 过期
function tokenExpired() {
  return { code: 40101, data: null, message: '登录已过期' };
}

// 权限不足
function forbidden(message = '权限不足') {
  return { code: 40300, data: null, message };
}

// 资源不存在
function notFound(message = '资源不存在') {
  return { code: 40400, data: null, message };
}

// 服务器内部错误
function serverError(message = '服务器内部错误') {
  return { code: 50000, data: null, message };
}

// 参数校验失败
function validationError(message) {
  return { code: 40000, data: null, message };
}

module.exports = { ok, fail, unauthorized, tokenExpired, forbidden, notFound, serverError, validationError };
