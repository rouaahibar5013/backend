// Converts a human-readable name into a URL-safe slug
// "Men's Shoes"  → "mens-shoes"
// "Atelier X"    → "atelier-x"
// "T-Shirts 2024"→ "t-shirts-2024"
// "Vêtements"    → "vetements"
// "Électronique" → "electronique"
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")                // decompose accented chars: "é" → "e" + accent
    .replace(/[\u0300-\u036f]/g, "") // remove the accent part → "e"
    .replace(/[^a-z0-9\s-]/g, "")   // remove remaining special characters
    .replace(/\s+/g, "-")            // replace spaces with hyphens
    .replace(/-+/g, "-");            // collapse multiple hyphens into one
};

export default generateSlug;