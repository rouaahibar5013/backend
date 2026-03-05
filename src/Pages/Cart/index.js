import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import formatPrice from '../../utils/formatPrice';

const Cart = () => {
    const { panier, retirerDuPanier, changerQuantite, viderPanier, totalArticles, totalPrix } = useCart();

    if (panier.length === 0) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center bg-[#fdf6ec] px-4">
                <div className="text-8xl mb-6">🛒</div>
                <h2 className="text-3xl font-bold font-serif text-[#2c2c2c] mb-3">
                    Votre panier est vide
                </h2>
                <p className="text-black/50 mb-8 text-center">
                    Découvrez nos produits artisanaux et ajoutez-les à votre panier
                </p>
                <Link
                    to="/"
                    className="bg-[#059669] hover:bg-[#047857] text-white font-bold px-8 py-3 rounded-full transition-colors duration-300 no-underline"
                >
                    Continuer mes achats
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-[#fdf6ec] min-h-screen py-12">
            <div className="container mx-auto px-4">

                {/* TITRE */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold font-serif text-[#2c2c2c] mb-1">
                        Mon Panier
                    </h1>
                    <p className="text-black/50">
                        {totalArticles} article{totalArticles > 1 ? 's' : ''} dans votre panier
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* LISTE PRODUITS */}
                    <div className="lg:col-span-2 space-y-4">
                        {panier.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-2xl p-5 shadow-[0_4px_15px_rgba(0,0,0,0.07)] flex items-center gap-5"
                            >
                                {/* IMAGE */}
                                <div className="w-20 h-20 bg-[#ecfdf5] rounded-xl flex items-center justify-center text-4xl shrink-0">
                                    {item.image}
                                </div>

                                {/* INFOS */}
                                <div className="flex-1">
                                    <h3 className="font-bold text-[#2c2c2c] mb-1">
                                        {item.nom}
                                    </h3>
                                    <p className="text-xs text-black/50 mb-3">
                                        📍 {item.region} — {item.producteur}
                                    </p>

                                    {/* QUANTITÉ */}
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => changerQuantite(item.id, item.quantite - 1)}
                                            className="w-8 h-8 rounded-full border-2 border-[#059669] text-[#059669] font-bold hover:bg-[#059669] hover:text-white transition-colors duration-200 flex items-center justify-center"
                                        >
                                            −
                                        </button>
                                        <span className="font-bold text-[#2c2c2c] w-6 text-center">
                                            {item.quantite}
                                        </span>
                                        <button
                                            onClick={() => changerQuantite(item.id, item.quantite + 1)}
                                            className="w-8 h-8 rounded-full border-2 border-[#059669] text-[#059669] font-bold hover:bg-[#059669] hover:text-white transition-colors duration-200 flex items-center justify-center"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>

                                {/* PRIX + SUPPRIMER */}
                                <div className="flex flex-col items-end gap-3 shrink-0">
                                    <span className="text-xl font-extrabold text-[#059669]">
                                        {(item.prix * item.quantite).toFixed(2)} DT
                                    </span>
                                    <button
                                        onClick={() => retirerDuPanier(item.id)}
                                        className="text-xs text-red-400 hover:text-red-600 transition-colors duration-200"
                                    >
                                        🗑 Supprimer
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* VIDER LE PANIER */}
                        <button
                            onClick={viderPanier}
                            className="text-sm text-red-400 hover:text-red-600 font-semibold transition-colors duration-200"
                        >
                            🗑 Vider le panier
                        </button>
                    </div>

                    {/* RÉSUMÉ COMMANDE */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_15px_rgba(0,0,0,0.07)] sticky top-4">
                            <h2 className="text-xl font-bold font-serif text-[#2c2c2c] mb-6">
                                Résumé de la commande
                            </h2>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between text-sm text-black/60">
                                    <span>Sous-total ({totalArticles} articles)</span>
                                    <span>{formatPrice(totalPrix)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-black/60">
                                    <span>Livraison</span>
                                    <span className="text-[#059669] font-semibold">Gratuite</span>
                                </div>
                                <div className="border-t border-gray-100 pt-3 flex justify-between font-extrabold text-lg text-[#2c2c2c]">
                                    <span>Total</span>
                                    <span className="text-[#059669]">{formatPrice(totalPrix)}</span>
                                </div>
                            </div>

                            <button className="w-full bg-[#059669] hover:bg-[#047857] text-white font-bold py-4 rounded-xl transition-colors duration-300 text-base mb-3">
                                Commander maintenant →
                            </button>
                            <Link
                                to="/"
                                className="block text-center text-sm text-black/50 hover:text-[#059669] transition-colors duration-200 no-underline"
                            >
                                ← Continuer mes achats
                            </Link>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Cart;