const express = require('express');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 标签列表（含题目计数）
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const tags = db.prepare(`
      SELECT t.*, COUNT(qt.question_id) as question_count
      FROM tags t
      LEFT JOIN question_tags qt ON t.id = qt.tag_id
      GROUP BY t.id
      ORDER BY t.id DESC
    `).all();
    res.json(ok(tags));
  } catch (e) { next(e); }
});

// 创建标签
router.post('/', adminAuth, validate({
  name: { required: true, type: 'string', message: '请输入标签名称' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { name, color } = req.body;

    const exists = db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    if (exists) return res.status(400).json(fail('标签名称已存在'));

    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
      .run(name, color || '#667eea');
    res.json(ok({ id: result.lastInsertRowid }, '创建成功'));
  } catch (e) { next(e); }
});

// 更新标签
router.put('/:id', adminAuth, validate({
  name: { required: true, type: 'string', message: '请输入标签名称' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { name, color } = req.body;

    const dup = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(name, req.params.id);
    if (dup) return res.status(400).json(fail('标签名称已存在'));

    db.prepare('UPDATE tags SET name=?, color=? WHERE id=?')
      .run(name, color || '#667eea', req.params.id);
    res.json(ok(null, '更新成功'));
  } catch (e) { next(e); }
});

// 删除标签
router.delete('/:id', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM question_tags WHERE tag_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json(ok(null, '已删除'));
  } catch (e) { next(e); }
});

// 公开 - 所有标签（用户端用）
router.get('/all', (req, res, next) => {
  try {
    const db = getDb();
    const tags = db.prepare('SELECT id, name, color FROM tags ORDER BY id').all();
    res.json(ok(tags));
  } catch (e) { next(e); }
});

module.exports = router;
