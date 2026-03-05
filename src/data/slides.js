import crafts from '../assets/images/crafts.png';
import food from '../assets/images/food.png';
import organic from '../assets/images/organic.png';

const slides = [
    {
        id: 1,
        titre: "Délices Maison",
        sousTitre: "Fraîchement préparé près de chez vous",
        description: "Découvrez confitures artisanales, pâtisseries et recettes traditionnelles faites avec amour",
        image: food,
        cta: "Voir les produits",
        url: "/produits?categorie=alimentation",
    },
    {
        id: 2,
        titre: "Artisanat Local",
        sousTitre: "Fabriqué avec passion",
        description: "Poteries uniques, tissage et œuvres d'art traditionnelles de nos artisans locaux",
        image: crafts,
        cta: "Voir l'artisanat",
        url: "/produits?categorie=artisanat",
    },
    {
        id: 3,
        titre: "Naturel & Bio",
        sousTitre: "Ingrédients purs, vraies saveurs",
        description: "Miel, huile d'olive, tisanes et produits bio directement de nos fermes locales",
        image: organic,
        cta: "Voir le bio",
        url: "/produits?categorie=bio",
    },
];

export default slides;