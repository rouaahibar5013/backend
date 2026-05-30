// utils/uploadLocal.js
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp"; // npm install sharp

const UPLOAD_DIR = path.resolve("public/uploads/products");

// Crée le dossier s'il n'existe pas
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const uploadProductImages = async (imageFiles) => {
  const images = Array.isArray(imageFiles) ? imageFiles : [imageFiles];

  const uploaded = await Promise.all(
    images.map(async (img) => {
      const filename = `${uuidv4()}.webp`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // Compression + conversion WebP (équivalent à ce que faisait Cloudinary)
      await sharp(img.tempFilePath)
        .resize({ width: 1000, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);

      return {
        url: `/uploads/products/${filename}`, // URL publique relative
        filename,                              // remplace public_id
      };
    })
  );

  return uploaded;
};