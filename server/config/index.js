const path = require('path');

// 加载 .env（必须在最上面）
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-production',
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'admin-quiz-2024',
  dbPath: process.env.DB_PATH || './quiz.db',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  jwtExpiresIn: '24h',
  rateLimit: {
    windowMs: 60 * 1000,   // 1 分钟
    max: 100,              // 最多 100 次
  },
  isProduction() {
    return config.nodeEnv === 'production';
  },
  isDevelopment() {
    return config.nodeEnv === 'development';
  },
};

module.exports = config;
