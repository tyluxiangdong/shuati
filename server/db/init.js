const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(__dirname, '..', config.dbPath));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const database = getDb();

  database.exec(`
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
      correct_streak INTEGER NOT NULL DEFAULT 0,
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

  // 迁移：已有数据库添加 correct_streak 列（SQLite 不支持 IF NOT EXISTS 对列）
  try {
    database.exec('ALTER TABLE wrong_questions ADD COLUMN correct_streak INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    // 列已存在则忽略
  }

  // 创建管理员账号（密码 bcrypt 哈希）
  const adminExists = database.prepare('SELECT id FROM admins WHERE username = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync(config.adminDefaultPassword, 10);
    database.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run('admin', hash);
    console.log('默认管理员账号已创建: admin');
  }

  // 种子数据
  seedIfEmpty(database);
}

function seedIfEmpty(database) {
  // 套餐
  const pkgCount = database.prepare('SELECT COUNT(*) as cnt FROM packages').get();
  if (pkgCount.cnt === 0) {
    database.prepare(`INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, price) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('基础刷题包', '包含基础题库，适合日常练习', 365, 20, 5, 5, 29.9);
    database.prepare(`INSERT INTO packages (name, description, valid_days, single_count, multi_count, judge_count, price) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run('高级冲刺包', '包含全部题库，适合考前冲刺', 180, 40, 10, 10, 59.9);
    console.log('默认套餐已创建');
  }

  // 题目
  const qCount = database.prepare('SELECT COUNT(*) as cnt FROM questions').get();
  if (qCount.cnt === 0) {
    seedDemoQuestions(database);
  }
}

function seedDemoQuestions(database) {
  const insert = database.prepare(
    'INSERT INTO questions (type, title, option_a, option_b, option_c, option_d, answer, analysis) VALUES (?,?,?,?,?,?,?,?)'
  );

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

  const insertMany = database.transaction((items) => {
    for (const q of items) {
      insert.run(q[0], q[1], q[2], q[3], q[4] || '', q[5] || '', q[6], q[7] || '');
    }
  });

  insertMany(questions);
  console.log(`已导入 ${questions.length} 道演示题目`);
}

module.exports = { getDb, initDB };
