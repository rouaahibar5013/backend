// services/aiAdminService.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
});

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 15; // 15 min cache for BI data

// ─────────────────────────────────────────────────────────────
// HELPER — strip markdown fences if model ignores responseMimeType
// ─────────────────────────────────────────────────────────────
function parseJSON(raw) {
    return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
}

// ─────────────────────────────────────────────────────────────
// SHARED JSON SCHEMA (injected in every prompt)
// ─────────────────────────────────────────────────────────────
const BASE_SCHEMA = `
Respond ONLY with valid JSON matching this schema:
{
  "reply": "Main response in French markdown. Use **bold** for titles, bullet points with •, and emojis. Always end with 1-2 actionable recommendations.",
  "highlights": [
    { "label": "Short metric label", "value": "Formatted value", "trend": "+12% vs last month OR null", "color": "blue | emerald | red | amber | violet | orange" }
  ]
}
"highlights" is an array of max 4 key metrics to display as cards. If not applicable, return [].
`;

// ─────────────────────────────────────────────────────────────
// 1. ORDERS ANALYSIS
// ─────────────────────────────────────────────────────────────
export const analyzeOrders = async (data, question) => {
    const cacheKey = `orders_${JSON.stringify(question).slice(0, 40)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const prompt = `You are a BI assistant for GOFFA, a Tunisian artisanal e-commerce platform targeting Swiss customers. 
The admin asked: "${question}"

Here is the order data from the database:
${JSON.stringify(data, null, 2)}

Order status values: en_attente (pending), confirmee (confirmed), en_preparation (preparing), expediee (shipped), livree (delivered), annulee (cancelled), remboursee (refunded), en_reclamation (complaint), retournee (returned).
Payment status: en_attente (pending), paye (paid), echoue (failed), rembourse (refunded).
Currency: TND (Tunisian Dinar).

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    const parsed = parseJSON(result.response.text());
    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 2. PRODUCTS ANALYSIS
// ─────────────────────────────────────────────────────────────
export const analyzeProducts = async (data, question) => {
    const cacheKey = `products_${JSON.stringify(question).slice(0, 40)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const prompt = `You are a BI assistant for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Here is the product data from the database:
${JSON.stringify(data, null, 2)}

Context: Products are artisanal Tunisian goods (pottery, textiles, spices, natural cosmetics, honey, olive oil...).
Low stock = less than 5 units. Low sales = less than 3 orders this month.

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    const parsed = parseJSON(result.response.text());
    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 3. USERS ANALYSIS
// ─────────────────────────────────────────────────────────────
export const analyzeUsers = async (data, question) => {
    const prompt = `You are a BI assistant for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Here is the user/customer data from the database:
${JSON.stringify(data, null, 2)}

Context: Customers are mainly Swiss buyers interested in authentic Tunisian products. Currency: TND.

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    return parseJSON(result.response.text());
};

// ─────────────────────────────────────────────────────────────
// 4. COMPLAINTS ANALYSIS
// ─────────────────────────────────────────────────────────────
export const analyzeComplaints = async (data, question) => {
    const cacheKey = `complaints_${JSON.stringify(question).slice(0, 40)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const prompt = `You are a customer support BI assistant for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Here is the complaint data from the database:
${JSON.stringify(data, null, 2)}

Complaint types:
- produit_defectueux = defective product
- commande_non_recue = order not received
- produit_incorrect = wrong product
- retard_livraison = delivery delay
- remboursement = refund request
- autre = other

Complaint statuses:
- en_attente = pending (needs attention)
- en_cours = in progress
- urgente = urgent (top priority)
- en_retard = overdue (past deadline)
- resolue = resolved
- rejetee = rejected

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    const parsed = parseJSON(result.response.text());
    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 5. REVIEWS ANALYSIS
// ─────────────────────────────────────────────────────────────
export const analyzeReviews = async (data, question) => {
    const cacheKey = `reviews_${JSON.stringify(question).slice(0, 40)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const prompt = `You are a product quality BI assistant for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Here is the review data from the database:
${JSON.stringify(data, null, 2)}

Ratings: 1-2 = negative, 3 = neutral, 4-5 = positive. Max rating = 5.

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    const parsed = parseJSON(result.response.text());
    cache.set(cacheKey, { data: parsed, ts: Date.now() });
    return parsed;
};

// ─────────────────────────────────────────────────────────────
// 6. EMAIL CAMPAIGN GENERATION
// ─────────────────────────────────────────────────────────────
export const generateEmailCampaign = async (data, question) => {
    const prompt = `You are a professional marketing copywriter for GOFFA, a Tunisian artisanal e-commerce brand.
The admin asked: "${question}"

Available products for this campaign:
${JSON.stringify(data.products, null, 2)}

Write a compelling marketing email in French.

Respond ONLY with valid JSON matching this schema:
{
  "reply": "Brief confirmation in French that the email was generated.",
  "highlights": [],
  "email": {
    "subject": "Email subject line (max 60 chars, include 1 emoji)",
    "preview_text": "Preview text shown in inbox (max 90 chars)",
    "body": "Full HTML-free email body in French, with greeting, main offer, product highlights, CTA button text, and sign-off. Use line breaks. Keep it warm, authentic, and professional."
  }
}`;

    const result = await model.generateContent(prompt);
    return parseJSON(result.response.text());
};

// ─────────────────────────────────────────────────────────────
// 7. FAQ GENERATION
// ─────────────────────────────────────────────────────────────
export const generateFAQ = async (data, question) => {
    const prompt = `You are a customer support specialist for GOFFA, a Tunisian artisanal e-commerce platform.
The admin asked: "${question}"

Here are the most frequent recent complaints to base FAQs on:
${JSON.stringify(data.complaints, null, 2)}

Generate 5 FAQ entries in French based on these recurring issues.
Valid faq categories: livraison, paiement, produits, retours, autre

Respond ONLY with valid JSON matching this schema:
{
  "reply": "Brief summary in French of what FAQs were generated and why.",
  "highlights": [],
  "faqs": [
    {
      "question_fr": "Question in French",
      "answer_fr": "Clear, helpful answer in French (2-3 sentences)",
      "category": "livraison | paiement | produits | retours | autre"
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    return parseJSON(result.response.text());
};

// ─────────────────────────────────────────────────────────────
// 8. GENERAL / DASHBOARD OVERVIEW
// ─────────────────────────────────────────────────────────────
export const analyzeGeneral = async (data, question) => {
    const prompt = `You are a BI assistant for GOFFA, a Tunisian artisanal e-commerce platform targeting Swiss customers.
The admin asked: "${question}"

Here is a general overview of the platform data:
${JSON.stringify(data, null, 2)}

${BASE_SCHEMA}`;

    const result = await model.generateContent(prompt);
    return parseJSON(result.response.text());
};