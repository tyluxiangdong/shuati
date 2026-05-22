const express = require('express');
const { getDb } = require('../db/init');
const { userAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 获取刷题题目（支持按题型过滤）
router.get('/questions', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.status(403).json(fail('请先激活序列号', 40300));
    if (user.expires_at && new Date(user.expires_at) < new Date()) return res.status(403).json(fail('账号已过期', 40300));

    const { type } = req.query;

    let questions;
    if (type && ['single', 'multi', 'judge'].includes(type)) {
      questions = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all(type);
    } else {
      // 兼容旧版：返回所有题型
      const singleQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('single');
      const multiQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('multi');
      const judgeQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('judge');
      questions = [...singleQs, ...multiQs, ...judgeQs];
    }

    // 进度（按 user_id + type 追踪）
    const progressType = type || 'all';
    let progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND type = ?').get(user.id, progressType);
    if (!progress) {
      db.prepare('INSERT INTO user_progress (user_id, type, current_index) VALUES (?, ?, 0)').run(user.id, progressType);
      progress = { current_index: 0 };
    }

    res.json(ok({
      questions: questions.map(q => ({ ...q, answer: undefined })),
      total: questions.length,
      progress: progress.current_index,
      practice_type: progressType,
    }));
  } catch (e) { next(e); }
});

// 提交单题答案
router.post('/answer', userAuth, validate({
  question_id: { required: true, type: 'number', message: '参数错误' },
  user_answer: { required: true, type: 'string', message: '请选择答案' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { question_id, user_answer, practice_type } = req.body;

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (!question) return res.status(404).json(fail('题目不存在', 40400));

    const isCorrect = question.answer.toUpperCase().trim() === user_answer.toUpperCase().trim();

    if (!isCorrect) {
      db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question_id);
    }

    // 更新进度（按题型）
    const progressType = practice_type || question.type;
    db.prepare('UPDATE user_progress SET current_index = current_index + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = ?')
      .run(req.user.id, progressType);

    res.json(ok({
      isCorrect,
      correctAnswer: question.answer,
      analysis: question.analysis,
      question: {
        id: question.id, type: question.type, title: question.title,
        option_a: question.option_a, option_b: question.option_b,
        option_c: question.option_c, option_d: question.option_d,
        option_e: question.option_e, option_f: question.option_f,
      },
    }));
  } catch (e) { next(e); }
});

// 重置刷题进度（按题型）
router.post('/reset', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { type } = req.body;
    const progressType = type || 'all';
    db.prepare('UPDATE user_progress SET current_index = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND type = ?')
      .run(req.user.id, progressType);
    res.json(ok(null, '进度已重置'));
  } catch (e) { next(e); }
});

// 获取所有题型进度
router.get('/progress', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.json(ok({ progress: [] }));

    const allProgress = db.prepare(
      'SELECT up.type, up.current_index, (SELECT COUNT(*) FROM questions q WHERE q.type = up.type) as total FROM user_progress up WHERE up.user_id = ? AND up.type != ?'
    ).all(req.user.id, 'all');

    // 各题型总数
    const singleTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'single'").get().cnt;
    const multiTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'multi'").get().cnt;
    const judgeTotal = db.prepare("SELECT COUNT(*) as cnt FROM questions WHERE type = 'judge'").get().cnt;

    res.json(ok({
      progress: allProgress,
      totals: { single: singleTotal, multi: multiTotal, judge: judgeTotal },
    }));
  } catch (e) { next(e); }
});

module.exports = router;
