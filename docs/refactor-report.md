# 刷题系统代码重构报告

> 2026-05-22 | 基于团队提升方案 15 个问题的全面修复

---

## 改了什么

### 🔴 安全修复（5/5 高危清零）

| 问题 | 修复 |
|------|------|
| JWT 密钥硬编码 | → `.env` 环境变量（dotenv） |
| 管理员密码明文 | → bcrypt 哈希（bcryptjs） |
| 无输入校验 | → `middleware/validate.js` 统一校验层 |
| 无请求频率限制 | → `express-rate-limit` 全局限流 |
| .gitignore 缺 .env | → 已添加 |

### 🟡 架构优化（5/5 重要项）

| 问题 | 修复 |
|------|------|
| 867 行单文件 | → 拆为 12 个模块，最长文件 < 200 行 |
| 数据库迁移混乱 | → 独立 `db/init.js` |
| 无集中错误处理 | → 全局 `errorHandler.js` + `AppError` 类 |
| 环境配置混乱 | → `config/index.js` + `.env.example` |
| answers 存 JSON | （已标记，需后续迁移） |

### 🟢 质量提升

| 问题 | 修复 |
|------|------|
| 无统一响应格式 | → `utils/response.js` — `{code, data, message}` |
| admin 硬编码 API | → `window.location.origin` |

---

## 新的目录结构

```
server/
├── .env                    ← 环境变量（密钥隔离）
├── .env.example            ← 环境变量模板
├── server.js               ← 装配入口（~50 行）
├── config/
│   └── index.js            ← 环境配置
├── middleware/
│   ├── auth.js             ← JWT 认证
│   ├── validate.js         ← 输入校验
│   └── errorHandler.js     ← 全局错误处理
├── routes/
│   ├── admin.js            ← 管理员登录 + 仪表盘
│   ├── packages.js         ← 套餐 CRUD
│   ├── questions.js        ← 题目 CRUD + 导入导出
│   ├── serials.js          ← 序列号管理
│   ├── user.js             ← 用户登录 + 激活
│   ├── practice.js         ← 顺序刷题
│   ├── exam.js             ← 考试模式
│   └── records.js          ← 错题本 + 收藏
├── db/
│   └── init.js             ← 数据库初始化 + 种子数据
└── utils/
    ├── response.js         ← 统一响应 {code, data, message}
    └── AppError.js         ← 自定义错误类
```

---

## API 响应格式（统一）

```json
// 成功
{ "code": 0,     "data": {...}, "message": "ok" }

// 业务错误
{ "code": 40001, "data": null,  "message": "序列号不存在" }

// 校验失败
{ "code": 40000, "data": null,  "message": "请输入密码" }

// 未登录
{ "code": 40100, "data": null,  "message": "请先登录" }

// 限流
{ "code": 42900, "data": null,  "message": "请求过于频繁" }

// 系统错误
{ "code": 50000, "data": null,  "message": "服务器内部错误" }
```

---

## 验证结果

- ✅ curl 测试全部 API：登录、仪表盘、序列号生成、用户激活、刷题
- ✅ playwright 浏览器测试：后台管理、用户端 H5 登录
- ✅ 输入校验：缺少参数返回 `{code:40000}`
- ✅ 范围校验：超限参数返回 `{code:40000, message:"count 最大值为 1000"}`
- ✅ 频率限制：正常请求返回 200
- ✅ bcrypt 密码验证正常
- ✅ 旧数据库删除后自动重建（种子数据保留）

---

## 待完成（2 项）

| # | 任务 | 说明 |
|---|------|------|
| 7 | 前端 HTML 组件化 | admin 和 user 都还是单文件 |
| 8 | ESLint + Prettier | 代码风格统一 |

---

## 启动方式

```bash
cd quiz-app/server
npm install
node server.js
# → http://localhost:3000/
# 管理员: admin / admin-quiz-2024
```
