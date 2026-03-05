import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useWishlist } from '../../../context/WishlistContext';
import { tendances } from '../../../data/products';
import formatPrice from '../../../utils/formatPrice';
import { FiHeart } from 'react-icons/fi';
import { FaHeart } from 'react-icons/fa';

const TrendingProducts = () => {
    const { ajouterAuPanier } = useCart();
    const { toggleFavori, estFavori } = useWishlist();

    return (
        <section className="bg-white py-16">
            <div className="container mx-auto px-4">
                <div className="flex items-start justify-between mb-10">
                    <div>
                        <span className="bg-[#c8872a] text-white text-xs font-bold px-4 py-1.5 rounded-full inline-block mb-3">
                            📈 TENDANCES
                        </span>
                        <h2 className="text-3xl font-bold font-serif text-[#2c2c2c] mb-1">
                            Les Plus Consultés
                        </h2>
                        <p className="text-black/50 text-sm">
                            Les produits préférés de nos clients
                        </p>
                    </div>
                    <Link to="/produits" className="text-[#c8872a] font-bold text-sm hover:underline mt-2 no-underline">
                        Voir tout →
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                    {tendances.map((produit) => (
                        <div
                            key={produit.id}
                            className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.07)] border-2 border-transparent hover:border-[#c8872a] hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                        >
                            <Link to={`/produits/${produit.id}`} className="no-underline">
                                <div className="relative h-52 bg-[#fff5ee] flex items-center justify-center cursor-pointer">
                                    <span className="text-7xl">{produit.image}</span>
                                    <span className="absolute top-3 left-3 bg-[#c8872a] text-white text-xs font-bold px-3 py-1 rounded-full">
                                        📈 Populaire
                                    </span>
                                    <span className="absolute top-3 right-3 bg-white/90 text-xs font-semibold px-3 py-1 rounded-full">
                                        👁 {produit.vues}
                                    </span>
                                    <span className="absolute bottom-3 right-3 bg-white/90 text-xs font-bold px-3 py-1 rounded-full">
                                        ⭐ {produit.note}
                                    </span>
                                </div>
                            </Link>

                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <Link to={`/produits/${produit.id}`} className="no-underline flex-1">
                                        <h3 className="text-base font-bold text-[#2c2c2c] hover:text-[#c8872a] transition-colors duration-200">
                                            {produit.nom}
                                        </h3>
                                    </Link>
                                    {/* BOUTON COEUR */}
                                    <button
                                        onClick={() => toggleFavori(produit)}
                                        className="ml-2 p-1.5 rounded-full hover:bg-red-50 transition-colors duration-200"
                                        aria-label="Ajouter aux favoris"
                                    >
                                        {estFavori(produit.id)
                                            ? <FaHeart size={18} className="text-red-500" />
                                            : <FiHeart size={18} className="text-gray-400 hover:text-red-400" />
                                        }
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 mb-4 flex-wrap">
                                    <Link
                                        to={`/producteurs/${encodeURIComponent(produit.producteur)}`}
                                        className="bg-[#d1fae5] text-emerald-600 text-xs font-semibold px-3 py-1 rounded-full no-underline hover:bg-emerald-200 transition-colors duration-200"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {produit.producteur}
                                    </Link>
                                    <span className="text-xs text-black/50">
                                        📍 {produit.region}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                    <span className="text-xl font-extrabold text-[#c8872a]">
                                        {formatPrice(produit.prix)}
                                    </span>
                                    <button
                                        onClick={() => ajouterAuPanier(produit)}
                                        className="bg-[#c8872a] hover:bg-[#a86e1f] text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors duration-300"
                                    >
                                        Ajouter
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default TrendingProducts;