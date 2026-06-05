// controllers/aiAdminController.js
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors.js';
import {
    analyzeOrders, analyzeProducts, analyzeUsers,
    analyzeComplaints, analyzeReviews,
    generateEmailCampaign, generateFAQ, analyzeGeneral,
} from '../services/aiAdminService.js';

function detectIntent(message) {
    const msg = message.toLowerCase();
    if (msg.match(/commande|order|vente|chiffre|revenue|ca |panier|livraison|expédi|paiement|factur/))
        return 'orders';
    if (msg.match(/produit|product|stock|rupture|catégorie|category|performan|vend|vue|visit|populaire/))
        return 'products';
    if (msg.match(/client|utilisateur|user|inscrit|nouveau|inactif|fidèle|acheteur/))
        return 'users';
    if (msg.match(/réclamation|reclamation|plainte|complaint|problème|signalement|défectueux|remboursement/))
        return 'complaints';
    if (msg.match(/avis|review|note|rating|négatif|positif|commentaire|satisfaction|étoile/))
        return 'reviews';
    if (msg.match(/email|campagne|newsletter|mail|rédige|génère.*mail|eid|ramadan|promo.*mail|été|solde.*mail/))
        return 'email';
    if (msg.match(/faq|question fréquente|aide|support|générer.*faq/))
        return 'faq';
    return 'general';
}

export const adminAIChat = catchAsyncErrors(async (req, res) => {
    const { message } = req.body;

    if (!message || message.trim().length < 3) {
        return res.status(400).json({ message: 'Message trop court ou manquant.' });
    }

    const intent = detectIntent(message);
    console.log(`[AI Admin] Intent: ${intent} | Message: "${message}"`);

    const handlers = {
        orders:     analyzeOrders,
        products:   analyzeProducts,
        users:      analyzeUsers,
        complaints: analyzeComplaints,
        reviews:    analyzeReviews,
        email:      generateEmailCampaign,
        faq:        generateFAQ,
        general:    analyzeGeneral,
    };

    const handler = handlers[intent] ?? analyzeGeneral;
    const aiResponse = await handler(message);

    return res.status(200).json({ ...aiResponse, intent });
});