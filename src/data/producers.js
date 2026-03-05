import { nouveautes, tendances } from './products';

const tousProduits = [...nouveautes, ...tendances];

export const producteurs = [
    {
        id: 1,
        nom: 'Domaine Vert',
        region: 'Sfax',
        description: 'Producteur d\'huile d\'olive bio depuis 3 générations. Notre domaine s\'étend sur 50 hectares d\'oliviers centenaires cultivés selon des méthodes traditionnelles respectueuses de l\'environnement.',
        specialite: 'Huiles & Olives',
        icone: '🫒',
        note: 4.9,
        nbAvis: 127,
        nbProduits: 8,
        membreDepuis: '2021',
        certifications: ['Bio', 'Commerce Équitable'],
        avis: [
            { id: 1, auteur: 'Sami B.', note: 5, commentaire: 'Huile exceptionnelle, goût authentique !', date: 'Jan 2026' },
            { id: 2, auteur: 'Leila M.', note: 5, commentaire: 'Livraison rapide, produit de qualité supérieure.', date: 'Fév 2026' },
            { id: 3, auteur: 'Ahmed K.', note: 4, commentaire: 'Très bon producteur, je recommande vivement.', date: 'Mar 2026' },
        ],
    },
    {
        id: 2,
        nom: 'Rucher Naturel',
        region: 'Kasserine',
        description: 'Apiculteur passionné installé dans les montagnes de Kasserine. Nos abeilles butinent librement dans des zones préservées loin de toute pollution, produisant un miel d\'une pureté exceptionnelle.',
        specialite: 'Miels & Apiculture',
        icone: '🍯',
        note: 5.0,
        nbAvis: 89,
        nbProduits: 5,
        membreDepuis: '2020',
        certifications: ['Bio', 'Artisanal'],
        avis: [
            { id: 1, auteur: 'Nadia T.', note: 5, commentaire: 'Le meilleur miel que j\'ai goûté de ma vie !', date: 'Fév 2026' },
            { id: 2, auteur: 'Karim L.', note: 5, commentaire: 'Pur et naturel, je commande tous les mois.', date: 'Mar 2026' },
            { id: 3, auteur: 'Sara H.', note: 5, commentaire: 'Producteur sérieux et produit authentique.', date: 'Mar 2026' },
        ],
    },
    {
        id: 3,
        nom: 'Bergerie Bio',
        region: 'Bizerte',
        description: 'Élevage ovin traditionnel au nord de la Tunisie. Nos animaux pâturent librement sur des terres verdoyantes, nous permettant de produire des fromages artisanaux d\'une qualité incomparable.',
        specialite: 'Fromages & Laiterie',
        icone: '🧀',
        note: 4.8,
        nbAvis: 64,
        nbProduits: 6,
        membreDepuis: '2022',
        certifications: ['Artisanal', 'Label Qualité'],
        avis: [
            { id: 1, auteur: 'Ines F.', note: 5, commentaire: 'Fromage frais délicieux, très authentique.', date: 'Jan 2026' },
            { id: 2, auteur: 'Mehdi R.', note: 4, commentaire: 'Bonne qualité, livraison soignée.', date: 'Fév 2026' },
            { id: 3, auteur: 'Yasmine A.', note: 5, commentaire: 'Je ne peux plus me passer de leur fromage !', date: 'Mar 2026' },
        ],
    },
    {
        id: 4,
        nom: 'Ferme Verte',
        region: 'Sfax',
        description: 'Agriculture biologique certifiée depuis 2019. Notre ferme familiale produit des légumes et fruits de saison sans pesticides, cultivés avec amour et respect de la terre tunisienne.',
        specialite: 'Fruits & Légumes Bio',
        icone: '🥬',
        note: 4.8,
        nbAvis: 156,
        nbProduits: 20,
        membreDepuis: '2019',
        certifications: ['Bio', 'Sans Pesticides'],
        avis: [
            { id: 1, auteur: 'Rania B.', note: 5, commentaire: 'Légumes frais et savoureux, bravo !', date: 'Fév 2026' },
            { id: 2, auteur: 'Omar S.', note: 4, commentaire: 'Très bonne qualité, je recommande.', date: 'Mar 2026' },
            { id: 3, auteur: 'Fatma K.', note: 5, commentaire: 'Livraison impeccable, produits excellents.', date: 'Mar 2026' },
        ],
    },
    {
        id: 5,
        nom: 'Palmeraie Tozeur',
        region: 'Tozeur',
        description: 'Au cœur de l\'oasis de Tozeur, notre palmeraie familiale cultive les meilleures variétés de dattes tunisiennes. Les Deglet Nour de notre production sont reconnues pour leur goût exceptionnel.',
        specialite: 'Dattes & Fruits du Désert',
        icone: '🌴',
        note: 5.0,
        nbAvis: 203,
        nbProduits: 7,
        membreDepuis: '2020',
        certifications: ['Bio', 'IGP Tunisie'],
        avis: [
            { id: 1, auteur: 'Walid M.', note: 5, commentaire: 'Les meilleures dattes de Tunisie !', date: 'Jan 2026' },
            { id: 2, auteur: 'Amira C.', note: 5, commentaire: 'Qualité premium, emballage soigné.', date: 'Fév 2026' },
            { id: 3, auteur: 'Bilel T.', note: 5, commentaire: 'Commande régulière, jamais déçu.', date: 'Mar 2026' },
        ],
    },
    {
        id: 6,
        nom: 'Épices Authentiques',
        region: 'Gabès',
        description: 'Spécialiste des épices et condiments traditionnels tunisiens depuis 1995. Notre harissa est préparée selon une recette ancestrale transmise de génération en génération.',
        specialite: 'Épices & Condiments',
        icone: '🌶️',
        note: 4.9,
        nbAvis: 178,
        nbProduits: 12,
        membreDepuis: '2021',
        certifications: ['Artisanal', 'Recette Traditionnelle'],
        avis: [
            { id: 1, auteur: 'Hichem B.', note: 5, commentaire: 'La vraie harissa tunisienne, parfaite !', date: 'Jan 2026' },
            { id: 2, auteur: 'Meriem L.', note: 5, commentaire: 'Goût authentique, qualité irréprochable.', date: 'Fév 2026' },
            { id: 3, auteur: 'Tarek N.', note: 4, commentaire: 'Très bon produit, je recommande.', date: 'Mar 2026' },
        ],
    },
];

export const getProducteurByNom = (nom) =>
    producteurs.find((p) => p.nom === nom);

export const getProduitsByProducteur = (nom) =>
    tousProduits.filter((p) => p.producteur === nom);

export default producteurs;