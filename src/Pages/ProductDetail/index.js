import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { nouveautes, tendances } from '../../data/products';
import formatPrice from '../../utils/formatPrice';
import { FiHeart } from 'react-icons/fi';
import { FaHeart } from 'react-icons/fa';

const tousProduits = [...nouveautes, ...tendances];

const ProductDetail = () => {
    const { id } = useParams();
    const { ajouterAuPanier } = useCart();
    const { toggleFavori, estFavori } = useWishlist();
    const [quantite, setQuantite] = useState(1);
    const [ajoute, setAjoute] = useState(false);

    const produit = tousProduits.find((p) => p.id === parseInt(id));

    if (!produit) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center bg-[#fdf6ec] px-4 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <h2 className="text-2xl font-bold font-serif text-[#2c2c2c] mb-3">
                    Produit introuvable
                </h2>
                <Link
                    to="/produits"
                    className="bg-emerald-600 text-white font-bold px-8 py-3 rounded-full no-underline hover:bg-emerald-500 transition-colors duration-300"
                >
                    Voir tous les produits
                </Link>
            </div>
        );
    }

    const handleAjouter = () => {
        for (let i = 0; i < quantite; i++) {
            ajouterAuPanier(produit);
        }
        setAjoute(true);
        setTimeout(() => setAjoute(false), 2000);
    };

    const similaires = tousProduits
        .filter((p) => p.id !== produit.id)
        .slice(0, 4);

    return (
        <div className="bg-[#fdf6ec] min-h-screen py-12">
            <div className="container mx-auto px-4">

                {/* FIL D'ARIANE */}
                <div className="flex items-center gap-2 text-sm text-black/50 mb-8">
                    <Link to="/" className="hover:text-emerald-600 no-underline transition-colors duration-200">
                        Accueil
                    </Link>
                    <span>›</span>
                    <Link to="/produits" className="hover:text-emerald-600 no-underline transition-colors duration-200">
                        Produits
                    </Link>
                    <span>›</span>
                    <span className="text-[#2c2c2c] font-semibold">{produit.nom}</span>
                </div>

                {/* DÉTAIL PRODUIT */}
                <div className="bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.07)] overflow-hidden mb-12">
                    <div className="grid grid-cols-1 md:grid-cols-2">

                        {/* IMAGE */}
                        <div className="bg-[#ecfdf5] flex items-center justify-center p-16 min-h-[400px]">
                            <span className="text-[150px]">{produit.image}</span>
                        </div>

                        {/* INFOS */}
                        <div className="p-10 flex flex-col justify-center">

                            {/* BADGES + COEUR */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex gap-2">
                                    <Link
                                        to={`/producteurs/${encodeURIComponent(produit.producteur)}`}
                                        className="bg-[#d1fae5] text-emerald-600 text-xs font-bold px-3 py-1 rounded-full no-underline hover:bg-emerald-200 transition-colors duration-200"
                                    >
                                    {produit.producteur}
                                    </Link>
                                    <span className="bg-[#f9f5f0] text-black/50 text-xs font-semibold px-3 py-1 rounded-full">
                                        📍 {produit.region}
                                    </span>
                                </div>
                                <button
                                    onClick={() => toggleFavori(produit)}
                                    className="p-2 rounded-full hover:bg-red-50 transition-colors duration-200"
                                    aria-label="Ajouter aux favoris"
                                >
                                    {estFavori(produit.id)
                                        ? <FaHeart size={24} className="text-red-500" />
                                        : <FiHeart size={24} className="text-gray-400 hover:text-red-400" />
                                    }
                                </button>
                            </div>

                            {/* NOM */}
                            <h1 className="text-3xl font-bold font-serif text-[#2c2c2c] mb-4">
                                {produit.nom}
                            </h1>

                            {/* NOTE */}
                            <div className="flex items-center gap-2 mb-6">
                                <span className="text-2xl">⭐</span>
                                <span className="font-bold text-[#2c2c2c]">{produit.note}</span>
                                <span className="text-black/40 text-sm">/ 5.0</span>
                            </div>

                            {/* DESCRIPTION */}
                            <p className="text-black/60 text-sm leading-relaxed mb-8">
                                Produit artisanal de qualité supérieure, fabriqué par {produit.producteur}
                                dans la région de {produit.region}. Naturel, authentique et savoureux.
                            </p>

                            {/* PRIX */}
                            <div className="text-4xl font-black text-emerald-600 mb-8">
                                {formatPrice(produit.prix)}
                            </div>

                            {/* QUANTITÉ */}
                            <div className="flex items-center gap-4 mb-6">
                                <span className="text-sm font-semibold text-black/60">Quantité :</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setQuantite(Math.max(1, quantite - 1))}
                                        className="w-9 h-9 rounded-full border-2 border-emerald-600 text-emerald-600 font-bold hover:bg-emerald-600 hover:text-white transition-colors duration-200 flex items-center justify-center"
                                    >
                                        −
                                    </button>
                                    <span className="font-bold text-[#2c2c2c] w-6 text-center text-lg">
                                        {quantite}
                                    </span>
                                    <button
                                        onClick={() => setQuantite(quantite + 1)}
                                        className="w-9 h-9 rounded-full border-2 border-emerald-600 text-emerald-600 font-bold hover:bg-emerald-600 hover:text-white transition-colors duration-200 flex items-center justify-center"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* BOUTONS */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleAjouter}
                                    className={`flex-1 font-bold py-4 rounded-xl transition-all duration-300 text-base ${
                                        ajoute
                                            ? 'bg-green-500 text-white'
                                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    }`}
                                >
                                    {ajoute ? '✅ Ajouté au panier !' : 'Ajouter au panier'}
                                </button>
                                <Link
                                    to="/panier"
                                    className="border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white font-bold px-6 py-4 rounded-xl transition-colors duration-300 no-underline text-center"
                                >
                                    🛒 Panier
                                </Link>
                            </div>

                        </div>
                    </div>
                </div>

                {/* PRODUITS SIMILAIRES */}
                <div>
                    <h2 className="text-2xl font-bold font-serif text-[#2c2c2c] mb-6">
                        Vous aimerez aussi
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        {similaires.map((p) => (
                            <Link
                                key={p.id}
                                to={`/produits/${p.id}`}
                                className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.07)] border-2 border-transparent hover:border-emerald-500 hover:-translate-y-1 transition-all duration-300 no-underline"
                            >
                                <div className="h-32 bg-[#ecfdf5] flex items-center justify-center">
                                    <span className="text-5xl">{p.image}</span>
                                </div>
                                <div className="p-3">
                                    <h3 className="text-xs font-bold text-[#2c2c2c] mb-2 line-clamp-2">
                                        {p.nom}
                                    </h3>
                                    <span className="text-sm font-extrabold text-emerald-600">
                                        {formatPrice(p.prix)}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ProductDetail;