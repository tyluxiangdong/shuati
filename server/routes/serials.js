const express = require('express');
const XLSX = require('xlsx');
const { getDb } = require('../db/init');
const { adminAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ok, fail } = require('../utils/response');

const router = express.Router();

// 序列号列表
router.get('/', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { keyword, status, page = 1, pageSize = 20 } = req.query;
    let sql = 'SELECT s.*, p.name as package_name FROM serial_codes s LEFT JOIN packages p ON s.package_id = p.id WHERE 1=1';
    const params = [];

    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND s.code LIKE ?'; params.push(`%${keyword.toUpperCase()}%`); }

    const total = db.prepare(sql.replace(/SELECT s\.\*, p\.name.*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
    sql += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const serials = db.prepare(sql).all(...params);
    res.json(ok({ serials, total, page: Number(page), pageSize: Number(pageSize) }));
  } catch (e) { next(e); }
});

// 生成序列号
router.post('/generate', adminAuth, validate({
  count: { required: true, type: 'number', min: 1, max: 1000, message: '数量需在1-1000之间' },
  package_id: { required: true, type: 'number', message: '请选择套餐' },
}), (req, res, next) => {
  try {
    const db = getDb();
    const { count, package_id } = req.body;

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(package_id);
    if (!pkg) return res.status(400).json(fail('套餐不存在'));

    const insert = db.prepare('INSERT INTO serial_codes (code, package_id, status) VALUES (?, ?, ?)');
    const codes = [];

    const generateMany = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const code = generateSerialCode();
        insert.run(code, package_id, 'unused');
        codes.push(code);
      }
    });

    generateMany();
    res.json(ok({ count: codes.length, codes }, `成功生成 ${codes.length} 个序列号`));
  } catch (e) { next(e); }
});

// 更新序列号状态
router.put('/:id', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { status } = req.body;
    if (status) {
      db.prepare('UPDATE serial_codes SET status = ? WHERE id = ?').run(status, req.params.id);
    }
    res.json(ok(null, '已更新'));
  } catch (e) { next(e); }
});

// 导出序列号
router.get('/export', adminAuth, (req, res, next) => {
  try {
    const db = getDb();
    const serials = db.prepare(
      'SELECT s.code, s.status, s.activated_at, s.expires_at, p.name as package_name FROM serial_codes s LEFT JOIN packages p ON s.package_id = p.id ORDER BY s.id DESC'
    ).all();

    const wsData = [['序列号', '套餐名称', '状态', '激活时间', '过期时间']];
    for (const s of serials) {
      wsData.push([s.code, s.package_name, s.status === 'unused' ? '未使用' : s.status === 'used' ? '已使用' : '已过期', s.activated_at || '', s.expires_at || '']);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, '序列号列表');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=serial_codes.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { next(e); }
});

function generateSerialCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

module.exports = router;
