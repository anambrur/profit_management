import mongoose from 'mongoose';
import envConfig from '../config/envConfig.js';
const connectDB = async () => {
  try {
    const connection = await mongoose.connect(envConfig.mongoUri as string);
    console.log(`MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

export default connectDB;
