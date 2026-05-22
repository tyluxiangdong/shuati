const express = require('express');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 套餐列表
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const packages = db.prepare('SELECT * FROM packages ORDER BY id DESC').all();
    res.json(ok(packages));
  } catch (e) { next(e); }
});

// 创建套餐
router.post('/', adminAuth, validate({
  name: { required: true, type: 'string', message: '请输入套餐名称' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price } = req.body;
    const result = db.prepare(
      `INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price) 
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(name, description || '', valid_days || 365, single_count || 0, multi_count || 0, judge_count || 0, exam_total || 50, pass_score || 60, exam_time || 0, price || 0);
    res.json(ok({ id: result.lastInsertRowid }, '创建成功'));
  } catch (e) { next(e); }
});

// 更新套餐
router.put('/:id', adminAuth, validate({
  name: { required: true, type: 'string', message: '请输入套餐名称' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price } = req.body;
    db.prepare(
      `UPDATE packages SET name=?, description=?, valid_days=?, single_count=?, multi_count=?, judge_count=?, exam_total=?, pass_score=?, exam_time=?, price=? WHERE id=?`
    ).run(name, description || '', valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price, req.params.id);
    res.json(ok(null, '更新成功'));
  } catch (e) { next(e); }
});

// 删除套餐
router.delete('/:id', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    res.json(ok(null, '已删除'));
  } catch (e) { next(e); }
});

module.exports = router;
