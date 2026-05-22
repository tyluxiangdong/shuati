const { validationError } = require('../utils/response');

/**
 * 通用请求体校验中间件工厂
 * @param {Object} rules - 校验规则 { fieldName: { required, type, min, max, pattern, message } }
 */
function validate(rules) {
  return (req, res, next) => {
    const body = req.body;
    const errors = [];

    for (const [field, rule] of Object.entries(rules)) {
      const value = body[field];

      // 必填检查
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(rule.message || `缺少必填参数: ${field}`);
        continue;
      }

      // 跳过非必填且为空的字段
      if (!rule.required && (value === undefined || value === null || value === '')) {
        continue;
      }

      // 类型检查
      if (rule.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(rule.message || `${field} 必须是数字`);
          continue;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors.push(`${field} 最小值为 ${rule.min}`);
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push(`${field} 最大值为 ${rule.max}`);
        }
      }

      if (rule.type === 'string') {
        if (typeof value !== 'string') {
          errors.push(rule.message || `${field} 必须是字符串`);
          continue;
        }
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(`${field} 最少 ${rule.minLength} 个字符`);
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push(`${field} 最多 ${rule.maxLength} 个字符`);
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push(rule.message || `${field} 格式不正确`);
        }
      }

      if (rule.type === 'array') {
        if (!Array.isArray(value)) {
          errors.push(rule.message || `${field} 必须是数组`);
          continue;
        }
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push(`${field} 至少包含 ${rule.minLength} 个元素`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json(validationError(errors.join('; ')));
    }

    next();
  };
}

module.exports = validate;
