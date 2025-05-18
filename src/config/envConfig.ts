import 'dotenv/config';

const _config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI,
};

const envConfig = Object.freeze(_config);
export default envConfig;
