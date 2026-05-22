# 团队技术能力提升方案

> 基于 quiz-app 项目代码审查，2026-05-22

---

## 一、代码审查报告

### 审查范围
`/quiz-app/server/server.js`（867行，单一文件）

### 发现的问题（按严重程度排序）

#### 🔴 严重 — 必须立即修复

| # | 问题 | 位置 | 风险 |
|---|---|---|---|
| 1 | JWT 密钥硬编码在源码中 | L12: `const JWT_SECRET = 'quiz-app-secret-key-2024'` | 源码泄露 = 所有 token 可被伪造 |
| 2 | 管理员密码明文存储 | L13 + L149 | 数据库泄露 = 管理员权限沦陷 |
| 3 | 无输入校验 | 全部 POST/PUT 路由 | SQL 注入、XSS、业务逻辑被破坏 |
| 4 | 无请求频率限制 | 全局 | 暴力破解、DDoS、撞库攻击 |
| 5 | `.gitignore` 缺少 `.env` 和密钥文件 | 仓库根目录 | 敏感信息可能被提交到 GitHub |

#### 🟡 重要 — 影响可维护性和稳定性

| # | 问题 | 说明 |
|---|---|---|
| 6 | 867行全在一个文件 | 路由、数据库、业务逻辑、中间件混在一起，改一个功能要翻整个文件 |
| 7 | `initDB()` 里做数据库迁移 | 表结构变更无法版本追踪，生产环境更新是灾难 |
| 8 | 没有集中错误处理 | 每个路由自己 `try/catch`，遗漏的地方直接 crash |
| 9 | 环境区分靠改代码 | 开发/测试/生产没有配置隔离 |
| 10 | `answers` 字段存 JSON 字符串 | L128 + L761，查询和分析非常困难 |

#### 🟢 建议 — 影响效率和协作

| # | 问题 | 说明 |
|---|---|---|
| 11 | 无 TypeScript | 参数类型靠猜，重构容易引入 bug |
| 12 | 无 ESLint/Prettier | 代码风格不统一 |
| 13 | 无单元测试 | 改一行代码不知道会不会崩 |
| 14 | 无 API 文档 | 前端对接靠读源码 |
| 15 | 前端单文件 HTML | 800+ 行 HTML 混合 JS/CSS，难以分工 |

---

## 二、改进优先级矩阵

```
          影响大
            │
    ② 先做   │   ① 立即做
   (本周)    │   (今天就改)
            │
  ──────────┼──────────→ 紧急度
            │
    ④ 排期   │   ③ 计划做
   (下迭代)  │   (下周)
            │
          影响小
```

| 优先级 | 事项 | 预估工时 | 理由 |
|---|---|---|---|
| ① | 环境变量 + 密码哈希 + 基础输入校验 | 2h | 安全底线，不修是事故 |
| ② | 代码分层（routes/controllers/services） | 4h | 当前结构已经阻碍开发效率 |
| ③ | 数据库迁移工具 + 集中错误处理 | 3h | 为后续迭代打基础 |
| ④ | TypeScript + 测试 + 文档 | 按需 | 团队规模扩大后再投入 |

---

## 三、分层学习路径

### Level 1：基础工程化（全员必修）

**目标：写的代码不挖坑，自己能维护**

1. **环境变量管理**
   - 学习 `dotenv`，理解 `.env` / `.env.example` 区别
   - 实践：把 quiz-app 的所有密钥抽到 `.env`
   - 标准：`console.log` 里不能出现任何密钥字符串

2. **输入校验**
   - 学习 `joi` 或 `zod` 做请求参数校验
   - 实践：给 quiz-app 每个 POST 路由加校验中间件
   - 标准：所有用户输入在进入业务逻辑前必须被验证

3. **密码安全**
   - 理解哈希 vs 加密的区别
   - 学习 `bcrypt` 或 `argon2`
   - 实践：把管理员密码从明文改成 bcrypt 哈希
   - 标准：数据库中不能存明文密码

4. **Git 规范**
   - `.gitignore` 必须包含 `.env`、`node_modules`、数据库文件
   - Commit message 格式：`type(scope): description`
   - 标准：`git log` 看起来像一本可读的变更日志

### Level 2：架构能力（技术负责人 / 想进阶的）

**目标：能独立设计和维护中型项目**

1. **分层架构**
   ```
   server/
   ├── routes/        # 只做路由定义，不做业务逻辑
   ├── controllers/   # 处理请求/响应，调用 service
   ├── services/      # 业务逻辑，不碰 req/res
   ├── models/        # 数据库访问层
   ├── middleware/     # 认证、校验、日志
   ├── config/        # 环境配置
   └── app.js         # Express 装配入口
   ```
   - 实践：把 quiz-app 的 `server.js` 拆成上面的结构
   - 标准：任意一个文件不超过 200 行

2. **数据库迁移**
   - 学习 `knex.js` 迁移机制
   - 实践：把 `initDB()` 里的建表语句改成迁移文件
   - 标准：`npm run migrate` 一键建库，版本可追溯

3. **集中错误处理**
   - Express 全局错误中间件
   - 自定义 `AppError` 类，区分业务错误和系统错误
   - 标准：任何未捕获的异常不会导致进程崩溃

4. **API 设计规范**
   - RESTful 命名约定
   - 统一的响应格式：`{ code, data, message }`
   - 分页参数标准化
   - 实践：把 quiz-app 的 API 响应统一包装

### Level 3：工程卓越（持续追求）

1. **TypeScript 迁移** — 类型安全是性价比最高的质量保障
2. **测试金字塔** — 单元 > 集成 > E2E
3. **CI/CD** — GitHub Actions 自动 lint、test、deploy
4. **性能监控** — 慢查询日志、API 响应时间追踪

---

## 四、编码规范速查

### 路由命名
```
✅ GET    /api/questions          # 列表
✅ GET    /api/questions/:id      # 详情
✅ POST   /api/questions          # 创建
✅ PUT    /api/questions/:id      # 更新
✅ DELETE /api/questions/:id      # 删除
✅ POST   /api/questions/batch-delete  # 批量操作

❌ GET    /api/getQuestions
❌ POST   /api/questions/delete
```

### 响应格式（统一）
```json
// 成功
{ "code": 0, "data": {...}, "message": "ok" }

// 业务错误
{ "code": 40001, "data": null, "message": "序列号不存在" }

// 系统错误
{ "code": 50000, "data": null, "message": "服务器内部错误" }
```

### 错误处理模板
```javascript
// ❌ 当前方式
app.post('/api/serials/generate', adminAuth, (req, res) => {
  const { count, package_id } = req.body;
  // ... 直接访问 req.body，没有校验
});

// ✅ 正确方式
// middleware/validate.js
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ code: 40001, message: error.details[0].message });
  req.validated = value;
  next();
};

// routes/serials.js
router.post('/generate', adminAuth, validate(generateSerialSchema), async (req, res, next) => {
  try {
    const result = await serialService.generate(req.validated);
    res.json({ code: 0, data: result });
  } catch (e) {
    next(e);  // 交给全局错误处理
  }
});
```

### 环境变量模板（.env.example）
```bash
# 服务
PORT=3000
NODE_ENV=development

# 数据库
DB_PATH=./data/quiz.db

# 安全（生产环境务必修改）
JWT_SECRET=change-me-in-production
ADMIN_PASSWORD_HASH=$2b$10$...

# 微信（后期接入）
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

---

## 五、本周行动清单

按优先级排序，可以直接分配：

| # | 任务 | 负责 | 预计 | 验收标准 | 状态 |
|---|---|---|---|---|---|
| 1 | 添加 `.env` 配置，抽出所有密钥 | 后端 | 0.5h | `server.js` 中无硬编码密钥 | ✅ 已完成 |
| 2 | 管理员密码改为 bcrypt 哈希 | 后端 | 0.5h | 数据库中不存明文密码 | ✅ 已完成 |
| 3 | 给所有 POST/PUT 加输入校验 | 后端 | 1h | curl 发异常数据不会导致 500 | ✅ 已完成 |
| 4 | 添加 `express-rate-limit` | 后端 | 0.5h | 同一 IP 1分钟最多100请求 | ✅ 已完成 |
| 5 | 拆 `server.js` 为分层结构 | 后端 | 4h | 最长文件不超 200 行 | ✅ 已完成 |
| 6 | 统一 API 响应格式 | 后端+前端 | 1h | 所有接口返回 `{code,data,message}` | ✅ 已完成 |
| 7 | 前端 HTML 拆分（组件化） | 前端 | 3h | 用户端和管理端各不超过 500 行 | ⬜ 待排期 |
| 8 | 添加 ESLint + Prettier | 全员 | 0.5h | `npm run lint` 无报错 | ⬜ 待排期 |

**已完成 6/8 项**（2026-05-22 更新）

---

## 六、长期度量指标

定期回顾，看数字是否在改善：

| 指标 | 重构前 | 重构后 | 目标（3个月） |
|---|---|---|
| 单文件最大行数 | 867 | < 200 |
| 生产事故次数/月 | 无记录 | < 1 |
| 安全漏洞（高危） | 5 | 0 | 0 |
| 测试覆盖率 | 0% | > 60% |
| API 无文档接口比例 | 100% | < 20% |
| 代码审查参与率 | 0% | 100% |

---

_这份文档会随着团队成长持续更新。每完成一项改进，过来更新状态。_
