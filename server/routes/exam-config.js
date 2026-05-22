const express = require('express');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok } = require('../utils/response');

const router = express.Router();

// 获取考试配置
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const config = db.prepare('SELECT * FROM exam_config WHERE id = 1').get();
    res.json(ok(config));
  } catch (e) { next(e); }
});

// 更新考试配置
router.put('/', adminAuth, validate({
  single_count: { required: true, type: 'number', message: '请输入单选题数量' },
  multi_count: { required: true, type: 'number', message: '请输入多选题数量' },
  judge_count: { required: true, type: 'number', message: '请输入判断题数量' },
  pass_score: { required: true, type: 'number', message: '请输入及格分数' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { single_count, multi_count, judge_count, pass_score, exam_time } = req.body;
    db.prepare(
      `UPDATE exam_config SET single_count=?, multi_count=?, judge_count=?, pass_score=?, exam_time=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`
    ).run(single_count, multi_count, judge_count, pass_score, exam_time || 0);
    res.json(ok(null, '考试配置已更新'));
  } catch (e) { next(e); }
});

module.exports = router;
