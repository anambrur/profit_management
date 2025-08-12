import mongoose from 'mongoose';
import envConfig from '../config/envConfig.js';

// Set mongoose options to prepare for production
mongoose.set('strictQuery', true); // Prepare for Mongoose 7 change

// Connection events for better debugging
mongoose.connection.on('connecting', () => {
  console.log('Connecting to MongoDB...');
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

const connectDB = async () => {
  try {
    const connectionOptions: mongoose.ConnectOptions = {
      retryWrites: true,
      w: 'majority',
      retryReads: true,
      maxPoolSize: process.env.nodeEnv === 'production' ? 50 : 20,
      minPoolSize: 5,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
      serverSelectionTimeoutMS: 50000,
      heartbeatFrequencyMS: 10000,
      waitQueueTimeoutMS: 15000,
    };

    if (process.env.nodeEnv === 'development') {
      // Development-specific options
      connectionOptions.autoIndex = true;
    } else {
      // Production-specific options
      connectionOptions.autoIndex = false; // Better performance in production
    }

    const connection = await mongoose.connect(
      envConfig.mongoUri as string,
      connectionOptions
    );

    console.log(`MongoDB connected: ${connection.connection.host}`);

    return connection;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      env: process.env.nodeEnv,
      mongoUri: envConfig.mongoUri ? 'configured' : 'missing',
    });

    // Graceful shutdown in production
    if (process.env.nodeEnv === 'production') {
      process.exit(1);
    } else {
      throw error; // Rethrow for development
    }
  }
};

// Add graceful shutdown handler
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});

export default connectDB;
