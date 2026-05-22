const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'quiz-app-secret-key-2024';
const ADMIN_SECRET = 'admin-quiz-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/user', express.static(path.join(__dirname, '..', 'user')));
app.use('/', express.static(__dirname));

// SQLite database
const db = new Database(path.join(__dirname, 'quiz.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Excel upload config
const upload = multer({ dest: 'uploads/' });

// ==================== Database Setup ====================
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      valid_days INTEGER NOT NULL DEFAULT 365,
      single_count INTEGER NOT NULL DEFAULT 30,
      multi_count INTEGER NOT NULL DEFAULT 10,
      judge_count INTEGER NOT NULL DEFAULT 10,
      exam_total INTEGER NOT NULL DEFAULT 50,
      pass_score INTEGER NOT NULL DEFAULT 60,
      exam_time INTEGER DEFAULT 0,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS serial_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      package_id INTEGER,
      status TEXT DEFAULT 'unused',
      activated_by INTEGER,
      activated_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      activated_at DATETIME,
      expires_at DATETIME,
      serial_code TEXT,
      package_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('single','multi','judge')),
      title TEXT NOT NULL,
      option_a TEXT NOT NULL DEFAULT '',
      option_b TEXT NOT NULL DEFAULT '',
      option_c TEXT DEFAULT '',
      option_d TEXT DEFAULT '',
      option_e TEXT DEFAULT '',
      option_f TEXT DEFAULT '',
      answer TEXT NOT NULL,
      analysis TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wrong_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS exam_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      package_id INTEGER,
      score REAL NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      duration INTEGER DEFAULT 0,
      answers TEXT DEFAULT '[]',
      passed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      package_id INTEGER,
      current_index INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, package_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );
  `);

  // Seed admin account
  const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', ADMIN_SECRET);
    console.log('默认管理员账号已创建: admin / admin-quiz-2024');
  }

  // Seed demo package if empty
  const pkgCount = db.prepare('SELECT COUNT(*) as cnt FROM packages').get();
  if (pkgCount.cnt === 0) {
    db.prepare(`INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, price) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('基础刷题包', '包含基础题库，适合日常练习', 365, 20, 5, 5, 29.9);
    db.prepare(`INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, price) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('高级冲刺包', '包含全部题库，适合考前冲刺', 180, 40, 10, 10, 59.9);
    console.log('默认套餐已创建');
  }

  // Seed demo questions if empty
  const qCount = db.prepare('SELECT COUNT(*) as cnt FROM questions').get();
  if (qCount.cnt === 0) {
    seedDemoQuestions();
  }
}

function seedDemoQuestions() {
  const insert = db.prepare(`INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, answer, analysis) VALUES (?,?,?,?,?,?,?,?)`);
  
  const questions = [
    ['single', 'HTTP 协议默认使用哪个端口？', '21', '80', '443', '8080', 'B', 'HTTP 协议默认使用 80 端口，HTTPS 使用 443 端口，FTP 使用 21 端口。'],
    ['single', 'JavaScript 中，typeof null 的结果是？', 'null', 'undefined', 'object', 'number', 'C', '这是 JavaScript 语言的一个历史遗留 Bug，typeof null 返回 "object"。'],
    ['single', '以下哪个不是 JavaScript 的基本数据类型？', 'String', 'Number', 'Array', 'Boolean', 'C', 'Array 是引用类型（对象），不是基本数据类型。基本类型包括 String、Number、Boolean、null、undefined、Symbol、BigInt。'],
    ['multi', '以下哪些是 CSS 定位方式？（多选）', 'static', 'relative', 'absolute', 'inline', 'ABC', 'CSS 定位方式包括：static（默认）、relative、absolute、fixed、sticky。inline 是 display 属性值。'],
    ['multi', '以下哪些属于 HTTP 请求方法？（多选）', 'GET', 'POST', 'SEND', 'DELETE', 'ABD', 'HTTP 标准请求方法包括 GET、POST、PUT、DELETE、HEAD、OPTIONS、PATCH 等。SEND 不是标准方法。'],
    ['judge', 'HTML5 是 HTML 的最新标准。', '正确', '错误', '', '', 'A', 'HTML5 确实是 W3C 推荐的 HTML 最新标准版本。'],
    ['judge', 'CSS 可以用于定义网页的交互行为。', '正确', '错误', '', '', 'B', 'CSS 主要用于定义网页的样式和布局，交互行为通常由 JavaScript 实现。'],
    ['judge', 'MySQL 是一种关系型数据库管理系统。', '正确', '错误', '', '', 'A', 'MySQL 确实是关系型数据库管理系统（RDBMS），使用 SQL 语言进行数据操作。'],
    ['single', 'Vue.js 中，组件之间的数据传递可以使用什么？', 'Props', 'State', 'Context', '以上都对', 'A', '在 Vue.js 中，父组件向子组件传递数据主要使用 Props。State 是 React 的概念，Context 虽然 Vue 也有 provide/inject，但最常用的是 Props。'],
    ['single', 'git clone 命令的作用是？', '创建新分支', '提交代码', '克隆远程仓库', '合并分支', 'C', 'git clone 用于将远程仓库完整复制到本地。'],
    ['multi', '以下哪些是版本控制工具？（多选）', 'Git', 'SVN', 'Docker', 'Mercurial', 'ABD', 'Git、SVN（Subversion）和 Mercurial 都是版本控制工具。Docker 是容器化平台。'],
    ['multi', '以下哪些是前端框架？（多选）', 'React', 'Django', 'Vue.js', 'Angular', 'ACD', 'React、Vue.js 和 Angular 都是前端框架。Django 是 Python 的后端 Web 框架。'],
    ['judge', 'JSON 是一种轻量级的数据交换格式。', '正确', '错误', '', '', 'A', 'JSON（JavaScript Object Notation）确实是一种轻量级的数据交换格式，易于人阅读和机器解析。'],
    ['judge', 'localStorage 中的数据会在浏览器关闭后自动清除。', '正确', '错误', '', '', 'B', 'localStorage 数据不会在浏览器关闭后自动清除，它是持久化存储。会随着浏览器关闭清除的是 sessionStorage。'],
    ['single', 'CSS 中，哪个属性用于设置元素的外边距？', 'padding', 'margin', 'border', 'outline', 'B', 'margin 设置外边距，padding 设置内边距，border 设置边框，outline 设置轮廓。'],
    ['single', 'npm 的全称是什么？', 'Node Package Manager', 'Node Program Manager', 'New Package Manager', 'Node Project Manager', 'A', 'npm 是 Node Package Manager 的缩写，是 Node.js 的默认包管理工具。'],
    ['multi', '以下哪些是合法的 JavaScript 变量声明方式？（多选）', 'var x = 1', 'let y = 2', 'const z = 3', 'int a = 4', 'ABC', 'JavaScript 使用 var、let、const 声明变量。int 是 Java/C 等语言的声明方式。'],
    ['single', '响应式设计的核心概念是什么？', '固定宽度', '媒体查询', '表格布局', 'Flash 动画', 'B', '响应式设计通过媒体查询（Media Queries）根据设备屏幕尺寸调整布局。'],
    ['judge', 'Promise 是 JavaScript 中处理异步操作的一种方式。', '正确', '错误', '', '', 'A', 'Promise 是 ES6 引入的异步编程解决方案，用于处理异步操作，避免回调地狱。'],
    ['single', 'HTML 中 <a> 标签的 target="_blank" 属性的作用是？', '当前窗口打开', '新窗口打开', '关闭窗口', '无任何作用', 'B', 'target="_blank" 使链接在新窗口或新标签页中打开。'],
    ['multi', '以下哪些是关系型数据库？（多选）', 'MySQL', 'MongoDB', 'PostgreSQL', 'SQLite', 'ACD', 'MySQL、PostgreSQL 和 SQLite 都是关系型数据库。MongoDB 是文档型 NoSQL 数据库。'],
    ['single', 'Linux 中，查看当前目录路径的命令是？', 'ls', 'cd', 'pwd', 'mkdir', 'C', 'pwd（print working directory）用于显示当前工作目录的完整路径。'],
    ['judge', 'TCP 是面向连接的传输层协议。', '正确', '错误', '', '', 'A', 'TCP（传输控制协议）是面向连接的、可靠的传输层协议，通过三次握手建立连接。'],
    ['single', 'CSS Flexbox 中，justify-content 属性用于控制？', '垂直对齐', '水平对齐', '元素排序', '元素换行', 'B', 'justify-content 控制主轴（默认水平方向）上的对齐方式。align-items 控制交叉轴对齐。'],
    ['single', 'Array.prototype.map() 方法的返回值是？', 'undefined', '原数组', '新数组', '单个值', 'C', 'map() 方法创建一个新数组，其元素是原数组每个元素调用回调函数后的结果。'],
    ['multi', '以下哪些是 HTTP 状态码类别？（多选）', '2xx 成功', '3xx 重定向', '4xx 客户端错误', '6xx 服务器错误', 'ABC', 'HTTP 状态码分为 1xx 信息、2xx 成功、3xx 重定向、4xx 客户端错误、5xx 服务器错误。没有 6xx。'],
    ['judge', 'CSS 选择器的优先级：内联样式 > ID 选择器 > 类选择器 > 标签选择器', '正确', '错误', '', '', 'A', 'CSS 选择器优先级从高到低：!important > 内联样式 > ID 选择器 > 类/属性/伪类选择器 > 标签/伪元素选择器。'],
    ['single', 'React 中，用于管理组件状态的 Hook 是？', 'useEffect', 'useState', 'useContext', 'useReducer', 'B', 'useState 是 React 中最基本的状态管理 Hook，用于在函数组件中添加状态。'],
    ['single', 'Git 中，将暂存区的修改提交到本地仓库的命令是？', 'git add', 'git push', 'git commit', 'git merge', 'C', 'git commit 将暂存区的修改提交到本地仓库。git add 将修改添加到暂存区，git push 推送到远程。'],
    ['judge', 'Node.js 是单线程的。', '正确', '错误', '', '', 'A', 'Node.js 的 JavaScript 执行环境是单线程的，但通过事件循环和 libuv 线程池实现异步非阻塞 I/O。'],
  ];

  const insertMany = db.transaction((items) => {
    for (const q of items) {
      insert.run(q[0], q[1], q[2], q[3], q[4] || '', q[5] || '', q[6], q[7] || '');
    }
  });

  insertMany(questions);
  console.log(`已导入 ${questions.length} 道演示题目`);
}

// ==================== Auth Middleware ====================
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: '登录已过期' });
  }
}

function userAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: '登录已过期' });
  }
}

// ==================== Admin APIs ====================

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT id, username FROM admins WHERE username = ? AND password = ?').get(username, password);
  if (!admin) return res.status(401).json({ error: '账号或密码错误' });
  const token = jwt.sign({ id: admin.id, username: admin.username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, admin });
});

// Dashboard stats
app.get('/api/admin/stats', adminAuth, (req, res) => {
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
  res.json(stats);
});

// ==================== Package APIs ====================
app.get('/api/packages', adminAuth, (req, res) => {
  const packages = db.prepare('SELECT * FROM packages ORDER BY id DESC').all();
  res.json(packages);
});

app.post('/api/packages', adminAuth, (req, res) => {
  const { name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price } = req.body;
  const result = db.prepare(`INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price) 
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(name, description || '', valid_days || 365, single_count || 0, multi_count || 0, judge_count || 0, exam_total || 50, pass_score || 60, exam_time || 0, price || 0);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/packages/:id', adminAuth, (req, res) => {
  const { name, description, valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price } = req.body;
  db.prepare(`UPDATE packages SET name=?, description=?, valid_days=?, single_count=?, multi_count=?, judge_count=?, exam_total=?, pass_score=?, exam_time=?, price=? WHERE id=?`)
    .run(name, description || '', valid_days, single_count, multi_count, judge_count, exam_total, pass_score, exam_time, price, req.params.id);
  res.json({ success: true });
});

app.delete('/api/packages/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== Question APIs ====================
app.get('/api/questions', adminAuth, (req, res) => {
  const { type, keyword, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM questions WHERE 1=1';
  const params = [];
  
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (keyword) { sql += ' AND title LIKE ?'; params.push(`%${keyword}%`); }
  
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as cnt')).get(...params).cnt;
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  
  const questions = db.prepare(sql).all(...params);
  res.json({ questions, total, page: Number(page), pageSize: Number(pageSize) });
});

app.post('/api/questions', adminAuth, (req, res) => {
  const { type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis } = req.body;
  const result = db.prepare(`INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis) 
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(type, title, option_a, option_b, option_c || '', option_d || '', option_e || '', option_f || '', answer, analysis || '');
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/questions/:id', adminAuth, (req, res) => {
  const { type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis } = req.body;
  db.prepare(`UPDATE questions SET type=?, title=?, option_a=?, option_b=?, option_c=?, option_d=?, option_e=?, option_f=?, answer=?, analysis=? WHERE id=?`)
    .run(type, title, option_a, option_b, option_c || '', option_d || '', option_e || '', option_f || '', answer, analysis || '', req.params.id);
  res.json({ success: true });
});

app.delete('/api/questions/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Batch delete questions
app.post('/api/questions/batch-delete', adminAuth, (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: '请选择要删除的题目' });
  const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
  const deleteMany = db.transaction((idList) => { for (const id of idList) stmt.run(id); });
  deleteMany(ids);
  res.json({ success: true, deleted: ids.length });
});

// Import questions from Excel
app.post('/api/questions/import', adminAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    if (!data.length) return res.status(400).json({ error: '文件中没有数据' });

    const insert = db.prepare(`INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, option_e, option_f, answer, analysis) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    
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
          type,
          title,
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
    res.json({ success: true, imported, errors, total: data.length });
  } catch (e) {
    res.status(500).json({ error: '导入失败: ' + e.message });
  }
});

// Download import template
app.get('/api/questions/template', (req, res) => {
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
});

// ==================== Serial Code APIs ====================
app.get('/api/serials', adminAuth, (req, res) => {
  const { keyword, status, page = 1, pageSize = 20 } = req.query;
  let sql = `SELECT s.*, p.name as package_name FROM serial_codes s LEFT JOIN packages p ON s.package_id = p.id WHERE 1=1`;
  const params = [];

  if (status) { sql += ' AND s.status = ?'; params.push(status); }
  if (keyword) { sql += ' AND s.code LIKE ?'; params.push(`%${keyword.toUpperCase()}%`); }

  const total = db.prepare(sql.replace(/SELECT s\.\*, p\.name.*FROM/, 'SELECT COUNT(*) as cnt FROM')).get(...params).cnt;
  sql += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

  const serials = db.prepare(sql).all(...params);
  res.json({ serials, total, page: Number(page), pageSize: Number(pageSize) });
});

app.post('/api/serials/generate', adminAuth, (req, res) => {
  const { count, package_id } = req.body;
  if (!count || count < 1 || count > 1000) return res.status(400).json({ error: '数量在1-1000之间' });
  if (!package_id) return res.status(400).json({ error: '请选择套餐' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(package_id);
  if (!pkg) return res.status(400).json({ error: '套餐不存在' });

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
  res.json({ success: true, count: codes.length, codes });
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

app.put('/api/serials/:id', adminAuth, (req, res) => {
  const { status } = req.body;
  if (status) {
    db.prepare('UPDATE serial_codes SET status = ? WHERE id = ?').run(status, req.params.id);
  }
  res.json({ success: true });
});

// Export serials to Excel
app.get('/api/serials/export', adminAuth, (req, res) => {
  const serials = db.prepare(`SELECT s.code, s.status, s.activated_at, s.expires_at, p.name as package_name 
    FROM serial_codes s LEFT JOIN packages p ON s.package_id = p.id ORDER BY s.id DESC`).all();
  
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
});

// ==================== User APIs ====================
app.get('/api/users', adminAuth, (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const total = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  const users = db.prepare(`SELECT u.*, p.name as package_name FROM users u LEFT JOIN packages p ON u.package_id = p.id 
    ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  res.json({ users, total, page: Number(page), pageSize: Number(pageSize) });
});

// ==================== User-side APIs (H5 / Mini Program) ====================

// User login (simplified for H5 - uses a simple ID)
app.post('/api/user/login', (req, res) => {
  const { openid } = req.body;
  if (!openid) return res.status(400).json({ error: '参数错误' });

  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
  if (!user) {
    const result = db.prepare('INSERT INTO users (openid, nickname) VALUES (?, ?)').run(openid, '用户' + Math.random().toString(36).substring(2, 8));
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  // Check if expired
  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return res.json({ 
      user, 
      activated: false, 
      expired: true,
      message: '账号已过期，请续费',
      token: jwt.sign({ id: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '24h' })
    });
  }

  const pkg = user.package_id ? db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id) : null;
  const token = jwt.sign({ id: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    user,
    activated: !!user.activated_at && !(user.expires_at && new Date(user.expires_at) < new Date()),
    expired: user.expires_at && new Date(user.expires_at) < new Date(),
    expires_at: user.expires_at,
    package: pkg,
    token
  });
});

// Activate serial code
app.post('/api/user/activate', (req, res) => {
  const { openid, code } = req.body;
  if (!openid || !code) return res.status(400).json({ error: '参数错误' });

  const serial = db.prepare('SELECT * FROM serial_codes WHERE code = ?').get(code.toUpperCase().trim());
  if (!serial) return res.status(400).json({ error: '序列号不存在' });
  if (serial.status === 'used') return res.status(400).json({ error: '该序列号已被使用' });
  if (serial.status === 'expired') return res.status(400).json({ error: '该序列号已过期' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(serial.package_id);
  if (!pkg) return res.status(400).json({ error: '套餐不存在' });

  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
  if (!user) {
    const result = db.prepare('INSERT INTO users (openid, nickname) VALUES (?, ?)').run(openid, '用户' + Math.random().toString(36).substring(2, 8));
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }

  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + pkg.valid_days * 24 * 60 * 60 * 1000);

  db.prepare('UPDATE serial_codes SET status = ?, activated_by = ?, activated_at = ?, expires_at = ? WHERE id = ?')
    .run('used', user.id, activatedAt.toISOString(), expiresAt.toISOString(), serial.id);
  
  db.prepare('UPDATE users SET activated_at = ?, expires_at = ?, serial_code = ?, package_id = ? WHERE id = ?')
    .run(activatedAt.toISOString(), expiresAt.toISOString(), code.toUpperCase().trim(), pkg.id, user.id);

  const token = jwt.sign({ id: user.id, openid: user.openid }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    success: true,
    message: '激活成功',
    user: { ...user, activated_at: activatedAt, expires_at: expiresAt, package_id: pkg.id },
    package: pkg,
    expires_at: expiresAt,
    token
  });
});

// Get user packages (for user to see)
app.get('/api/user/packages', (req, res) => {
  const packages = db.prepare("SELECT id, name, description, valid_days, single_count, multi_count, judge_count, price FROM packages WHERE status = 'active'").all();
  res.json(packages);
});

// ==================== Practice APIs ====================

// Get practice questions
app.get('/api/practice/questions', userAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.package_id) return res.status(403).json({ error: '请先激活序列号' });
  if (user.expires_at && new Date(user.expires_at) < new Date()) return res.status(403).json({ error: '账号已过期' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);
  
  const singleQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('single');
  const multiQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('multi');
  const judgeQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY id').all('judge');

  const questions = [
    ...singleQs.slice(0, pkg.single_count),
    ...multiQs.slice(0, pkg.multi_count),
    ...judgeQs.slice(0, pkg.judge_count),
  ];

  // Get progress
  let progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND package_id = ?').get(user.id, pkg.id);
  if (!progress) {
    db.prepare('INSERT INTO user_progress (user_id, package_id, current_index) VALUES (?, ?, 0)').run(user.id, pkg.id);
    progress = { current_index: 0 };
  }

  res.json({
    questions: questions.map(q => ({
      ...q,
      answer: undefined // hide answer in response, show only when submitted
    })),
    total: questions.length,
    progress: progress.current_index
  });
});

// Submit single answer (sequential mode)
app.post('/api/practice/answer', userAuth, (req, res) => {
  const { question_id, user_answer } = req.body;
  
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  const isCorrect = question.answer.toUpperCase().trim() === user_answer.toUpperCase().trim();

  // Add to wrong questions if incorrect
  if (!isCorrect) {
    const existing = db.prepare('SELECT id FROM wrong_questions WHERE user_id = ? AND question_id = ?').get(req.user.id, question_id);
    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question_id);
    }
  }

  // Update progress
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.package_id) {
    db.prepare('UPDATE user_progress SET current_index = current_index + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND package_id = ?')
      .run(req.user.id, user.package_id);
  }

  res.json({
    isCorrect,
    correctAnswer: question.answer,
    analysis: question.analysis,
    question: {
      id: question.id,
      type: question.type,
      title: question.title,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      option_e: question.option_e,
      option_f: question.option_f,
    }
  });
});

// Get progress
app.get('/api/practice/progress', userAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.package_id) return res.json({ progress: 0, total: 0 });

  const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND package_id = ?').get(req.user.id, user.package_id);
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);
  const total = pkg.single_count + pkg.multi_count + pkg.judge_count;

  res.json({ progress: progress?.current_index || 0, total });
});

// ==================== Exam APIs ====================

// Start exam
app.post('/api/exam/start', userAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.package_id) return res.status(403).json({ error: '请先激活序列号' });
  if (user.expires_at && new Date(user.expires_at) < new Date()) return res.status(403).json({ error: '账号已过期' });

  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(user.package_id);
  
  // Random select questions
  const singleQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('single', pkg.single_count);
  const multiQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('multi', pkg.multi_count);
  const judgeQs = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY RANDOM() LIMIT ?').all('judge', pkg.judge_count);

  // Shuffle all together
  const allQs = [...singleQs, ...multiQs, ...judgeQs].sort(() => Math.random() - 0.5);

  // Insert exam record placeholder
  const result = db.prepare('INSERT INTO exam_records (user_id, package_id, total) VALUES (?, ?, ?)')
    .run(user.id, pkg.id, allQs.length);

  res.json({
    exam_id: result.lastInsertRowid,
    questions: allQs.map(q => ({
      id: q.id,
      type: q.type,
      title: q.title,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e,
      option_f: q.option_f,
    })),
    total: allQs.length,
    pass_score: pkg.pass_score,
    time_limit: pkg.exam_time
  });
});

// Submit exam
app.post('/api/exam/submit', userAuth, (req, res) => {
  const { exam_id, answers } = req.body;
  
  const exam = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(exam_id, req.user.id);
  if (!exam) return res.status(404).json({ error: '考试记录不存在' });

  let correctCount = 0;
  let wrongCount = 0;
  const answerDetails = [];

  for (const ans of answers) {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(ans.question_id);
    if (!question) continue;

    const isCorrect = question.answer.toUpperCase().trim() === ans.user_answer.toUpperCase().trim();

    if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
      // Add to wrong questions
      db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question.id);
    }

    answerDetails.push({
      question_id: question.id,
      type: question.type,
      title: question.title,
      option_a: question.option_a,
      option_b: question.option_b,
      option_c: question.option_c,
      option_d: question.option_d,
      option_e: question.option_e,
      option_f: question.option_f,
      correct_answer: question.answer,
      user_answer: ans.user_answer,
      isCorrect,
      analysis: question.analysis
    });
  }

  const score = exam.total > 0 ? Math.round((correctCount / exam.total) * 100) : 0;
  const passed = score >= (db.prepare('SELECT pass_score FROM packages WHERE id = ?').get(exam.package_id)?.pass_score || 60) ? 1 : 0;

  db.prepare('UPDATE exam_records SET score=?, correct_count=?, wrong_count=?, answers=?, passed=? WHERE id=?')
    .run(score, correctCount, wrongCount, JSON.stringify(answerDetails), passed, exam_id);

  res.json({
    score,
    total: exam.total,
    correctCount,
    wrongCount,
    passed,
    answerDetails
  });
});

// Get exam records
app.get('/api/exam/records', userAuth, (req, res) => {
  const records = db.prepare(`SELECT e.*, p.name as package_name FROM exam_records e 
    LEFT JOIN packages p ON e.package_id = p.id 
    WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 20`).all(req.user.id);
  res.json(records);
});

// Get exam detail
app.get('/api/exam/record/:id', userAuth, (req, res) => {
  const record = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  record.answerDetails = JSON.parse(record.answers || '[]');
  res.json(record);
});

// ==================== Wrong Questions APIs ====================
app.get('/api/wrongs', userAuth, (req, res) => {
  const wrongs = db.prepare(`SELECT w.id as wrong_id, q.* FROM wrong_questions w 
    JOIN questions q ON w.question_id = q.id 
    WHERE w.user_id = ? ORDER BY w.id DESC`).all(req.user.id);

  // Don't return answers in list
  res.json(wrongs.map(w => ({ ...w, answer: undefined })));
});

app.post('/api/wrongs', userAuth, (req, res) => {
  const { question_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO wrong_questions (user_id, question_id) VALUES (?, ?)').run(req.user.id, question_id);
  res.json({ success: true });
});

app.delete('/api/wrongs/:id', userAuth, (req, res) => {
  db.prepare('DELETE FROM wrong_questions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Remove wrong question when answered correctly
app.post('/api/wrongs/remove', userAuth, (req, res) => {
  const { question_id } = req.body;
  db.prepare('DELETE FROM wrong_questions WHERE user_id = ? AND question_id = ?').run(req.user.id, question_id);
  res.json({ success: true });
});

// ==================== Favorites APIs ====================
app.get('/api/favorites', userAuth, (req, res) => {
  const favs = db.prepare(`SELECT f.id as fav_id, q.* FROM favorites f 
    JOIN questions q ON f.question_id = q.id 
    WHERE f.user_id = ? ORDER BY f.id DESC`).all(req.user.id);
  res.json(favs.map(f => ({ ...f, answer: undefined })));
});

app.post('/api/favorites', userAuth, (req, res) => {
  const { question_id } = req.body;
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, question_id) VALUES (?, ?)').run(req.user.id, question_id);
  res.json({ success: true });
});

app.delete('/api/favorites/:id', userAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ==================== User Stats API ====================
app.get('/api/user/stats', userAuth, (req, res) => {
  const wrongCount = db.prepare('SELECT COUNT(*) as cnt FROM wrong_questions WHERE user_id = ?').get(req.user.id).cnt;
  const favCount = db.prepare('SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ?').get(req.user.id).cnt;
  const examCount = db.prepare('SELECT COUNT(*) as cnt FROM exam_records WHERE user_id = ?').get(req.user.id).cnt;
  
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM exam_records WHERE user_id = ?').get(req.user.id);
  
  const progress = db.prepare(`SELECT p.name as pkg_name, up.current_index, 
    p.single_count + p.multi_count + p.judge_count as total
    FROM user_progress up JOIN packages p ON up.package_id = p.id 
    WHERE up.user_id = ?`).get(req.user.id);

  res.json({
    wrongCount,
    favCount,
    examCount,
    avgScore: avgScore?.avg ? Math.round(avgScore.avg) : 0,
    progress
  });
});

// ==================== Start Server ====================
initDB();
app.listen(PORT, () => {
  console.log(`\n  刷题小程序服务已启动: http://localhost:${PORT}`);
  console.log(`  后台管理: http://localhost:${PORT}/admin`);
  console.log(`  用户端: http://localhost:${PORT}/user`);
  console.log(`  管理员账号: admin / ${ADMIN_SECRET}\n`);
});
