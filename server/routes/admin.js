const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 管理员登录
router.post('/login', validate({
  username: { required: true, type: 'string', message: '请输入用户名' },
  password: { required: true, type: 'string', message: '请输入密码' },
}), (req, res, next) => {
  try {
    const { username, password } = req.body;
    const db = getDb();
    const admin = db.prepare('SELECT id, username, password FROM admins WHERE username = ?').get(username);
    if (!admin) return res.status(401).json(fail('账号或密码错误', 40100));

    const valid = bcrypt.compareSync(password, admin.password);
    if (!valid) return res.status(401).json(fail('账号或密码错误', 40100));

    const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json(ok({
      token,
      admin: { id: admin.id, username: admin.username },
    }, '登录成功'));
  } catch (e) {
    next(e);
  }
});

// 仪表盘统计
router.get('/stats', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const stats = {
      totalQuestions: db.prepare('SELECT COUNT(*) as cnt FROM questions').get().cnt,
      totalPackages: db.prepare('SELECT COUNT(*) as cnt FROM packages').get().cnt,
      totalUsers: db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt,
      totalSerials: db.prepare('SELECT COUNT(*) as cnt FROM serial_codes').get().cnt,
      usedSerials: db.prepare("SELECT COUNT(*) as cnt FROM serial_codes WHERE status = 'used'").get().cnt,
      unusedSerials: db.prepare("SELECT COUNT(*) as cnt FROM serial_codes WHERE status = 'unused'").get().cnt,
      totalExams: db.prepare('SELECT COUNT(*) as cnt FROM exam_records').get().cnt,
      todayExams: db.prepare("SELECT COUNT(*) as cnt FROM exam_records WHERE date(created_at) = date('now')").get().cnt,
      singleCount: db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type='single'").get().cnt,
      multiCount: db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type='multi'").get().cnt,
      judgeCount: db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type='judge'").get().cnt,
    };
    res.json(ok(stats));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
