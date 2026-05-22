const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, tokenExpired } = require('../utils/response');

/**
 * 管理员认证中间件
 */
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(unauthorized('请先登录'));

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ code: 40300, data: null, message: '需要管理员权限' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json(tokenExpired());
    }
    return res.status(401).json(unauthorized('无效的令牌'));
  }
}

/**
 * 用户认证中间件
 */
function userAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json(unauthorized('请先登录'));

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json(tokenExpired());
    }
    return res.status(401).json(unauthorized('无效的令牌'));
  }
}

module.exports = { adminAuth, userAuth };
