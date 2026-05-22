const config = require('../config');
const { serverError } = require('../utils/response');

/**
 * 全局错误处理中间件
 * 捕获所有未处理的错误，返回统一格式
 */
function errorHandler(err, req, res, _next) {
  // Multer 文件大小超限
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 40000, data: null, message: '文件大小超出限制' });
  }

  // 自定义业务错误
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      code: err.code || 40001,
      data: null,
      message: err.message,
    });
  }

  // JSON 解析失败
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 40000, data: null, message: '请求体格式不正确' });
  }

  // 未知错误 - 记录日志
  console.error('[ERROR]', err.message, config.isDevelopment() ? err.stack : '');

  return res.status(500).json(serverError(
    config.isDevelopment() ? err.message : '服务器内部错误'
  ));
}

module.exports = errorHandler;
