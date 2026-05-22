const express = require('express');
const { getDb } = require('../db/init');
const { userAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok } = require('../utils/response');

const router = express.Router();

// 错题列表
router.get('/wrongs', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const wrongs = db.prepare(
      'SELECT w.id as wrong_id, q.* FROM wrong_questions w JOIN questions q ON w.question_id = q.id WHERE w.user_id = ? ORDER BY w.id DESC'
    ).all(req.user.id);
    res.json(ok(wrongs.map(w => ({ ...w, answer: undefined }))));
  } catch (e) { next(e); }
});

// 添加错题
router.post('/wrongs', userAuth, validate({
  question_id: { required: true, type: 'number', message: '参数错误' },
}), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, req.body.question_id);
    res.json(ok(null, '已添加'));
  } catch (e) { next(e); }
});

// 删除错题
router.delete('/wrongs/:id', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM wrong_questions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json(ok(null, '已移除'));
  } catch (e) { next(e); }
});

// 答对后移除错题
router.post('/wrongs/remove', userAuth, validate({
  question_id: { required: true, type: 'number', message: '参数错误' },
}), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM wrong_questions WHERE user_id = ? AND question_id = ?').run(req.user.id, req.body.question_id);
    res.json(ok(null, '已移除'));
  } catch (e) { next(e); }
});

// 错题练习 - 获取题目列表
router.get('/wrongs/practice', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const wrongs = db.prepare(
      'SELECT w.id as wrong_id, w.correct_streak, q.* FROM wrong_questions w JOIN questions q ON w.question_id = q.id WHERE w.user_id = ? ORDER BY w.id'
    ).all(req.user.id);
    res.json(ok(wrongs.map(w => ({ ...w, answer: undefined }))));
  } catch (e) { next(e); }
});

// 错题练习 - 提交答案
router.post('/wrongs/answer', userAuth, validate({
  wrong_id: { required: true, type: 'number', message: '参数错误' },
  question_id: { required: true, type: 'number', message: '参数错误' },
  user_answer: { required: true, type: 'string', message: '请选择答案' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { wrong_id, question_id, user_answer } = req.body;

    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (!question) return res.status(404).json(fail('题目不存在', 40400));

    const isCorrect = question.answer.toUpperCase().trim() === user_answer.toUpperCase().trim();
    const record = db.prepare('SELECT correct_streak FROM wrong_questions WHERE id = ?').get(wrong_id);
    let removed = false;
    let streak = 0;

    if (isCorrect) {
      streak = (record?.correct_streak || 0) + 1;
      if (streak >= 3) {
        db.prepare('DELETE FROM wrong_questions WHERE id = ? AND user_id = ?').run(wrong_id, req.user.id);
        removed = true;
      } else {
        db.prepare('UPDATE wrong_questions SET correct_streak = ? WHERE id = ?').run(streak, wrong_id);
      }
    } else {
      db.prepare('UPDATE wrong_questions SET correct_streak = 0 WHERE id = ?').run(wrong_id);
    }

    res.json(ok({
      isCorrect,
      correctAnswer: question.answer,
      analysis: question.analysis,
      removed,
      streak: removed ? 0 : streak,
    }));
  } catch (e) { next(e); }
});

// 收藏列表
router.get('/favorites', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    const favs = db.prepare(
      'SELECT f.id as fav_id, q.* FROM favorites f JOIN questions q ON f.question_id = q.id WHERE f.user_id = ? ORDER BY f.id DESC'
    ).all(req.user.id);
    res.json(ok(favs.map(f => ({ ...f, answer: undefined }))));
  } catch (e) { next(e); }
});

// 添加收藏
router.post('/favorites', userAuth, validate({
  question_id: { required: true, type: 'number', message: '参数错误' },
}), (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)').run(req.user.id, req.body.question_id);
    res.json(ok(null, '已收藏'));
  } catch (e) { next(e); }
});

// 取消收藏
router.delete('/favorites/:id', userAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json(ok(null, '已取消'));
  } catch (e) { next(e); }
});

module.exports = router;
