/**
 * 自定义应用错误类
 * 用于区分业务错误和系统错误，配合全局错误中间件使用
 */
class AppError extends Error {
  /**
   * @param {string} message - 错误描述
   * @param {number} statusCode - HTTP 状态码
   * @param {number} code - 业务错误码
   */
  constructor(message, statusCode = 400, code = 40001) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // 区分预期内错误和未知错误
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
