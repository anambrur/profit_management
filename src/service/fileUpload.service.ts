import fs from 'fs';
import cloudinary from '../config/cloudinary';
const uploadLocalFileToCloudinary = async (localPath: string, folder?: string) => {
  try {
    const result = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: folder },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      fs.createReadStream(localPath).pipe(stream);
    });
    return result;
  } catch (error) {
    await fs.promises.unlink(localPath);
  }
};

export default uploadLocalFileToCloudinary;
