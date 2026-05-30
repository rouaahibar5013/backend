// utils/deleteLocalImage.js
import fs from "fs";
import path from "path";

export const deleteLocalImage = (filename) => {
  if (!filename) return;
  const filepath = path.resolve("public/uploads/products", filename);
  fs.unlink(filepath, (err) => {
    if (err) console.error("Erreur suppression image:", err.message);
  });
};