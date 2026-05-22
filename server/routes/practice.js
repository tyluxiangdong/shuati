const express = require('express');
const { getDb } = require('../db/init');
const { userAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 获取刷题题目
router.get('/questions', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.status(403).json(fail('请先激活序列号', 40300));
    if (user.expires_at && new Date(user.expires_at) < new Date()) return res.status(403).json(fail('账号已过期', 40300));

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);

    const singleQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('single');
    const multiQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('multi');
    const judgeQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('judge');

    const questions = [
      ...singleQs.slice(0, pkg.single_count),
      ...multiQs.slice(0, pkg.multi_count),
      ...judgeQs.slice(0, pkg.judge_count),
    ];

    // 进度
    let progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND package_id = ?').get(user.id, pkg.id);
    if (!progress) {
      db.prepare('INSERT INTO user_progress (user_id, package_id, current_index) VALUES (?, ?, 0)').run(user.id, pkg.id);
      progress = { current_index: 0 };
    }

    res.json(ok({
      questions: questions.map(q => ({ ...q, answer: undefined })),
      total: questions.length,
      progress: progress.current_index,
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
    const { question_id, user_answer } = req.body;

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (!question) return res.status(404).json(fail('题目不存在', 40400));

    const isCorrect = question.answer.toUpperCase().trim() === user_answer.toUpperCase().trim();

    if (!isCorrect) {
      db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question_id);
    }

    // 更新进度
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user.package_id) {
      db.prepare('UPDATE user_progress SET current_index = current_index + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND package_id = ?')
        .run(req.user.id, user.package_id);
    }

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

// 重置刷题进度
router.post('/reset', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.status(403).json(fail('请先激活序列号'));
    db.prepare('UPDATE user_progress SET current_index = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND package_id = ?')
      .run(req.user.id, user.package_id);
    res.json(ok(null, '进度已重置'));
  } catch (e) { next(e); }
});

// 获取进度
router.get('/progress', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.json(ok({ progress: 0, total: 0 }));

    const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND package_id = ?').get(req.user.id, user.package_id);
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);
    const total = pkg.single_count + pkg.multi_count + pkg.judge_count;

    res.json(ok({ progress: progress?.current_index || 0, total }));
  } catch (e) { next(e); }
});

module.exports = router;
