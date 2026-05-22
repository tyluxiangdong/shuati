const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

// 题目列表（含标签）
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { type, keyword, tag_id, page = 1, pageSize = 20 } = req.query;
    let sql = 'FROM questions q WHERE 1=1';
    const params = [];

    if (type) { sql += ' AND q.type = ?'; params.push(type); }
    if (keyword) { sql += ' AND q.title LIKE ?'; params.push(`%${keyword}%`); }
    if (tag_id) {
      const tagIds = tag_id.split(',').map(Number).filter(Boolean);
      if (tagIds.length) {
        sql += ` AND q.id IN (SELECT question_id FROM question_tags WHERE tag_id IN (${tagIds.map(() => '?').join(',')}))`;
        params.push(...tagIds);
      }
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt ${sql}`).get(...params).cnt;
    sql = `SELECT q.* ${sql} ORDER BY q.id DESC LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const questions = db.prepare(sql).all(...params);

    // 为每道题附加标签
    const tagStmt = db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN question_tags qt ON t.id = qt.tag_id
      WHERE qt.question_id = ?
    `);
    const questionsWithTags = questions.map(q => ({
      ...q,
      tags: tagStmt.all(q.id),
    }));

    res.json(ok({ questions: questionsWithTags, total, page: Number(page), pageSize: Number(pageSize) }));
  } catch (e) { next(e); }
});

// 创建题目
router.post('/', adminAuth, validate({
  type: { required: true, type: 'string', message: '请选择题型' },
  title: { required: true, type: 'string', message: '请输入题干' },
  answer: { required: true, type: 'string', message: '请输入正确答案' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis, tag_ids } = req.body;
    const result = db.prepare(
      `INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis) 
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(type, title, option_a, option_b, option_c || '', option_d || '', option_e || '', option_f || '', answer, analysis || '');

    // 关联标签
    if (tag_ids && tag_ids.length) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)');
      for (const tagId of tag_ids) insertTag.run(result.lastInsertRowid, tagId);
    }

    res.json(ok({ id: result.lastInsertRowid }, '添加成功'));
  } catch (e) { next(e); }
});

// 更新题目
router.put('/:id', adminAuth, validate({
  type: { required: true, type: 'string', message: '请选择题型' },
  title: { required: true, type: 'string', message: '请输入题干' },
  answer: { required: true, type: 'string', message: '请输入正确答案' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis, tag_ids } = req.body;
    db.prepare(
      `UPDATE questions SET type=?, title=?, option_a=?, option_b=?, option_c=?, option_d=?, option_e=?, option_f=?, answer=?, analysis=? WHERE id=?`
    ).run(type, title, option_a, option_b, option_c || '', option_d || '', option_e || '', option_f || '', answer, analysis || '', req.params.id);

    // 更新标签关联
    db.prepare('DELETE FROM question_tags WHERE question_id = ?').run(req.params.id);
    if (tag_ids && tag_ids.length) {
      const insertTag = db.prepare('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)');
      for (const tagId of tag_ids) insertTag.run(req.params.id, tagId);
    }

    res.json(ok(null, '更新成功'));
  } catch (e) { next(e); }
});

// 删除题目
router.delete('/:id', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
    res.json(ok(null, '已删除'));
  } catch (e) { next(e); }
});

// 批量删除
router.post('/batch-delete', adminAuth, validate({
  ids: { required: true, type: 'array', minLength: 1, message: '请选择要删除的题目' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
    const deleteMany = db.transaction((idList) => { for (const id of idList) stmt.run(id); });
    deleteMany(ids);
    res.json(ok({ deleted: ids.length }, `成功删除 ${ids.length} 道题目`));
  } catch (e) { next(e); }
});

// 批量更新（修改题型/添加标签）
router.post('/batch-update', adminAuth, validate({
  ids: { required: true, type: 'array', minLength: 1, message: '请选择题目' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { ids, type, tag_ids } = req.body;

    if (!type && (!tag_ids || !tag_ids.length)) {
      return res.status(400).json(fail('请选择要修改的题型或标签'));
    }

    const updateMany = db.transaction(() => {
      for (const id of ids) {
        if (type) {
          db.prepare('UPDATE questions SET type = ? WHERE id = ?').run(type, id);
        }
        if (tag_ids && tag_ids.length) {
          const insertTag = db.prepare('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)');
          for (const tagId of tag_ids) insertTag.run(id, tagId);
        }
      }
    });
    updateMany();

    res.json(ok({ updated: ids.length }, `成功更新 ${ids.length} 道题目`));
  } catch (e) { next(e); }
});

// Excel 批量导入
router.post('/import', adminAuth, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json(fail('请上传文件'));

    const db = getDb();
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!data.length) return res.status(400).json(fail('文件中没有数据'));

    const insert = db.prepare(
      'INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );

    let imported = 0, errors = 0;
    const importMany = db.transaction((rows) => {
      for (const row of rows) {
        const typeMap = { '单选题': 'single', '多选题': 'multi', '判断题': 'judge', 'single': 'single', 'multi': 'multi', 'judge': 'judge' };
        const type = typeMap[row['题型']] || typeMap[row['type']] || 'single';
        const title = row['题干'] || row['title'] || '';
        if (!title) { errors++; continue; }

        const answer = (row['正确答案'] || row['answer'] || '').toString().toUpperCase().trim();
        if (!answer) { errors++; continue; }

        insert.run(
          type, title,
          row['选项A'] || row['option_a'] || '',
          row['选项B'] || row['option_b'] || '',
          row['选项C'] || row['option_c'] || '',
          row['选项D'] || row['option_d'] || '',
          row['选项E'] || row['option_e'] || '',
          row['选项F'] || row['option_f'] || '',
          answer,
          row['解析'] || row['analysis'] || ''
        );
        imported++;
      }
    });

    importMany(data);
    res.json(ok({ imported, errors, total: data.length }, `成功导入 ${imported} 题`));
  } catch (e) { next(e); }
});

// 下载导入模板
router.get('/template', (req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['题型', '题干', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '正确答案', '解析'],
      ['single', '1+1等于几？', '1', '2', '3', '4', '', '', 'B', '基础数学运算'],
      ['multi', '以下哪些是编程语言？', 'Python', 'HTML', 'Java', 'CSS', '', '', 'AC', 'HTML和CSS是标记/样式语言'],
      ['judge', '地球是圆的。', '正确', '错误', '', '', '', '', 'A', '地球近似球体'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 10 }, { wch: 40 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 12 }, { wch: 40 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '题库导入模板');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=quiz_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { next(e); }
});

module.exports = router;
