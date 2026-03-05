// Converts a human-readable name into a URL-safe slug
// "Men's Shoes"  → "mens-shoes"
// "Atelier X"    → "atelier-x"
// "T-Shirts 2024"→ "t-shirts-2024"
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters like ' " ! @
    .replace(/\s+/g, "-")          // replace spaces with hyphens
    .replace(/-+/g, "-");          // collapse multiple hyphens into one
};

export default generateSlug;