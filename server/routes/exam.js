const express = require('express');
const { getDb } = require('../db/init');
const { userAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 开始考试
router.post('/start', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user.package_id) return res.status(403).json(fail('请先激活序列号', 40300));
    if (user.expires_at && new Date(user.expires_at) < new Date()) return res.status(403).json(fail('账号已过期', 40300));

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);

    const singleQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('single', pkg.single_count);
    const multiQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('multi', pkg.multi_count);
    const judgeQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('judge', pkg.judge_count);

    const allQs = [...singleQs, ...multiQs, ...judgeQs].sort(() => Math.random() - 0.5);

    const result = db.prepare('INSERT INTO exam_records (user_id, package_id, total) VALUES (?, ?, ?)')
      .run(user.id, pkg.id, allQs.length);

    res.json(ok({
      exam_id: result.lastInsertRowid,
      questions: allQs.map(q => ({
        id: q.id, type: q.type, title: q.title,
        option_a: q.option_a, option_b: q.option_b,
        option_c: q.option_c, option_d: q.option_d,
        option_e: q.option_e, option_f: q.option_f,
      })),
      total: allQs.length,
      pass_score: pkg.pass_score,
      time_limit: pkg.exam_time,
    }));
  } catch (e) { next(e); }
});

// 提交考试
router.post('/submit', userAuth, validate({
  exam_id: { required: true, type: 'number', message: '参数错误' },
  answers: { required: true, type: 'array', minLength: 1, message: '请作答' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { exam_id, answers } = req.body;

    const exam = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(exam_id, req.user.id);
    if (!exam) return res.status(404).json(fail('考试记录不存在', 40400));

    let correctCount = 0;
    let wrongCount = 0;
    const answerDetails = [];

    for (const ans of answers) {
      const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(ans.question_id);
      if (!question) continue;

      const isCorrect = question.answer.toUpperCase().trim() === (ans.user_answer || '').toUpperCase().trim();

      if (isCorrect) {
        correctCount++;
      } else {
        wrongCount++;
        db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question.id);
      }

      answerDetails.push({
        question_id: question.id, type: question.type, title: question.title,
        option_a: question.option_a, option_b: question.option_b,
        option_c: question.option_c, option_d: question.option_d,
        option_e: question.option_e, option_f: question.option_f,
        correct_answer: question.answer, user_answer: ans.user_answer || '',
        isCorrect, analysis: question.analysis,
      });
    }

    const score = exam.total > 0 ? Math.round((correctCount / exam.total) * 100) : 0;
    const passScore = db.prepare('SELECT pass_score FROM packages WHERE id = ?').get(exam.package_id)?.pass_score || 60;
    const passed = score >= passScore ? 1 : 0;

    db.prepare('UPDATE exam_records SET score=?, correct_count=?, wrong_count=?, answers=?, passed=? WHERE id=?')
      .run(score, correctCount, wrongCount, JSON.stringify(answerDetails), passed, exam_id);

    res.json(ok({
      score, total: exam.total, correctCount, wrongCount, passed, answerDetails,
    }));
  } catch (e) { next(e); }
});

// 考试记录列表
router.get('/records', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const records = db.prepare(
      'SELECT e.*, p.name as package_name FROM exam_records e LEFT JOIN packages p ON e.package_id = p.id WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 20'
    ).all(req.user.id);
    res.json(ok(records));
  } catch (e) { next(e); }
});

// 考试记录详情
router.get('/record/:id', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const record = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!record) return res.status(404).json(fail('记录不存在', 40400));

    record.answerDetails = JSON.parse(record.answers || '[]');
    res.json(ok(record));
  } catch (e) { next(e); }
});

module.exports = router;
