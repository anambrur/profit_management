import 'dotenv/config';

const _config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  api_base_url: process.env.API_BASE_URL,
};

const envConfig = Object.freeze(_config);
export default envConfig;
