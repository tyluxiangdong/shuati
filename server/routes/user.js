const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDb } = require('../db/init');
const { userAuth, adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// H5 用户登录
router.post('/login', validate({
  openid: { required: true, type: 'string', message: '参数错误' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { openid } = req.body;

    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const result = db.prepare('INSERT INTO users (openid, nickname) VALUES (?, ?)').run(openid, '用户' + Math.random().toString(36).substring(2, 8));
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    const token = jwt.sign({ id: user.id, openid: user.openid }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    const pkg = user.package_id ? db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id) : null;
    const isExpired = user.expires_at && new Date(user.expires_at) < new Date();
    const isActivated = !!user.activated_at && !isExpired;

    res.json(ok({
      user,
      activated: isActivated,
      expired: isExpired,
      expires_at: user.expires_at,
      package: pkg,
      token,
    }));
  } catch (e) { next(e); }
});

// 激活序列号
router.post('/activate', validate({
  openid: { required: true, type: 'string', message: '参数错误' },
  code: { required: true, type: 'string', message: '请输入序列号' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { openid, code } = req.body;
    const cleanCode = code.toUpperCase().trim();

    const serial = db.prepare('SELECT * FROM serial_codes WHERE code = ?').get(cleanCode);
    if (!serial) return res.status(400).json(fail('序列号不存在'));
    if (serial.status === 'used') return res.status(400).json(fail('该序列号已被使用'));
    if (serial.status === 'expired') return res.status(400).json(fail('该序列号已过期'));

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(serial.package_id);
    if (!pkg) return res.status(400).json(fail('套餐不存在'));

    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
    if (!user) {
      const result = db.prepare('INSERT INTO users (openid, nickname) VALUES (?, ?)').run(openid, '用户' + Math.random().toString(36).substring(2, 8));
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }

    const activatedAt = new Date();
    const expiresAt = new Date(activatedAt.getTime() + pkg.valid_days * 24 * 60 * 60 * 1000);

    db.prepare('UPDATE serial_codes SET status = ?, activated_by = ?, activated_at = ?, expires_at = ? WHERE id = ?')
      .run('used', user.id, activatedAt.toISOString(), expiresAt.toISOString(), serial.id);
    db.prepare('UPDATE users SET activated_at = ?, expires_at = ?, serial_code = ?, package_id = ? WHERE id = ?')
      .run(activatedAt.toISOString(), expiresAt.toISOString(), cleanCode, pkg.id, user.id);

    const token = jwt.sign({ id: user.id, openid: user.openid }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    res.json(ok({
      user: { ...user, activated_at: activatedAt, expires_at: expiresAt, package_id: pkg.id },
      package: pkg,
      expires_at: expiresAt,
      token,
    }, '激活成功'));
  } catch (e) { next(e); }
});

// 用户端套餐列表（公开）
router.get('/packages', (req, res, next) => {
  try {
    const db = getDb();
    const packages = db.prepare("SELECT id, name, description, valid_days, price FROM packages WHERE status = 'active'").all();
    res.json(ok(packages));
  } catch (e) { next(e); }
});

// 用户统计
router.get('/stats', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const wrongCount = db.prepare('SELECT COUNT(*) as cnt FROM wrong_questions WHERE user_id = ?').get(req.user.id).cnt;
    const favCount = db.prepare('SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ?').get(req.user.id).cnt;
    const examCount = db.prepare('SELECT COUNT(*) as cnt FROM exam_records WHERE user_id = ?').get(req.user.id).cnt;
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM exam_records WHERE user_id = ?').get(req.user.id);

    // 各题型进度
    const allProgress = db.prepare(
      'SELECT type, current_index FROM user_progress WHERE user_id = ? AND type != ?'
    ).all(req.user.id, 'all');

    const singleTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'single'").get().cnt;
    const multiTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'multi'").get().cnt;
    const judgeTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'judge'").get().cnt;

    res.json(ok({
      wrongCount, favCount, examCount,
      avgScore: avgScore?.avg ? Math.round(avgScore.avg) : 0,
      progress: allProgress,
      totals: { single: singleTotal, multi: multiTotal, judge: judgeTotal },
    }));
  } catch (e) { next(e); }
});

// 管理员 - 用户列表
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { page = 1, pageSize = 20 } = req.query;
    const total = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const users = db.prepare(
      'SELECT u.*, p.name as package_name FROM users u LEFT JOIN packages p ON u.package_id = p.id ORDER BY u.id DESC LIMIT ? OFFSET ?'
    ).all(Number(pageSize), (Number(page) - 1) * Number(pageSize));
    res.json(ok({ users, total, page: Number(page), pageSize: Number(pageSize) }));
  } catch (e) { next(e); }
});

module.exports = router;
