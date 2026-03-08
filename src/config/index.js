const { z } = require('zod');

const envSchema = z.object({
  PORT: z.coerce.number().default(8790),
  DATABASE_URL: z.string().min(1),

  API_KEY: z.string().optional(),

  WHEELPROS_AUTH_BASE_URL: z.string().default('https://api.wheelpros.com/auth'),
  WHEELPROS_PRODUCTS_BASE_URL: z.string().default('https://api.wheelpros.com/products'),
  WHEELPROS_USERNAME: z.string().optional(),
  WHEELPROS_PASSWORD: z.string().optional(),
  WHEELPROS_COMPANY: z.coerce.number().default(1500),
  WHEELPROS_CURRENCY: z.string().default('USD'),

  // Wheel-Size (fitment)
  WHEEL_SIZE_BASE_URL: z.string().optional(),
  WHEEL_SIZE_API_KEY: z.string().optional(),

  // Backward-compatible aliases
  WHEELSIZE_BASE_URL: z.string().optional(),
  WHEELSIZE_API_KEY: z.string().optional(),

  // TireConnect scrape adapter (interim)
  TIRECONNECT_WIDGET_ID: z.string().optional(),
  TIRECONNECT_LOCATION_ID: z.string().optional(),
  TIRECONNECT_BASE_URL: z.string().optional()
});

function loadConfig(processEnv = process.env) {
  const parsed = envSchema.safeParse(processEnv);
  if (!parsed.success) {
    const err = new Error('Invalid environment configuration');
    err.details = parsed.error.flatten();
    throw err;
  }
  const cfg = { ...parsed.data };
  if (!cfg.WHEEL_SIZE_BASE_URL && cfg.WHEELSIZE_BASE_URL) cfg.WHEEL_SIZE_BASE_URL = cfg.WHEELSIZE_BASE_URL;
  if (!cfg.WHEEL_SIZE_API_KEY && cfg.WHEELSIZE_API_KEY) cfg.WHEEL_SIZE_API_KEY = cfg.WHEELSIZE_API_KEY;
  return cfg;
}

module.exports = { loadConfig };
