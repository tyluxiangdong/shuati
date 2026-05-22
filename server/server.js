/**
 * 刷题小程序 - 主入口
 * 
 * 架构分层：
 *   config/     - 环境配置
 *   middleware/  - 认证、校验、错误处理
 *   routes/     - 业务路由（按模块拆分）
 *   db/         - 数据库初始化
 *   utils/      - 工具函数（统一响应、自定义错误）
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const { initDB } = require('./db/init');
const errorHandler = require('./middleware/errorHandler');

// 路由
const adminRouter = require('./routes/admin');
const packagesRouter = require('./routes/packages');
const questionsRouter = require('./routes/questions');
const serialsRouter = require('./routes/serials');
const userRouter = require('./routes/user');
const practiceRouter = require('./routes/practice');
const examRouter = require('./routes/exam');
const recordsRouter = require('./routes/records');
const examConfigRouter = require('./routes/exam-config');
const tagsRouter = require('./routes/tags');

const app = express();

// ==================== 全局中间件 ====================

// CORS
app.use(cors());

// 请求体解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 全局限流
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 42900, data: null, message: '请求过于频繁，请稍后再试' },
});
app.use('/api', limiter);

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/user', express.static(path.join(__dirname, '..', 'user')));
app.use('/', express.static(__dirname));

// ==================== API 路由挂载 ====================

app.use('/api/admin', adminRouter);          // 管理员登录、仪表盘
app.use('/api/packages', packagesRouter);    // 套餐 CRUD
app.use('/api/questions', questionsRouter);  // 题目 CRUD + 导入导出
app.use('/api/serials', serialsRouter);      // 序列号管理
app.use('/api/user', userRouter);            // 用户登录、激活
app.use('/api/practice', practiceRouter);    // 顺序刷题
app.use('/api/exam', examRouter);            // 考试模式
app.use('/api/exam-config', examConfigRouter); // 考试配置
app.use('/api/tags', tagsRouter);            // 标签管理
app.use('/api', recordsRouter);              // 错题本 + 收藏 (/api/wrongs, /api/favorites)

// ==================== 全局错误处理 ====================
app.use(errorHandler);

// ==================== 启动服务 ====================
initDB();

app.listen(config.port, () => {
  console.log(`\n  刷题小程序服务已启动: http://localhost:${config.port}`);
  console.log(`  环境: ${config.nodeEnv}`);
  console.log(`  后台管理: http://localhost:${config.port}/admin`);
  console.log(`  用户端:   http://localhost:${config.port}/user`);
  console.log(`  管理员账号: admin\n`);
});
