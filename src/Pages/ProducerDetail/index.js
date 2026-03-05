import { useParams, Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { getProducteurByNom, getProduitsByProducteur } from '../../data/producers';
import formatPrice from '../../utils/formatPrice';
import { FiHeart } from 'react-icons/fi';
import { FaHeart, FaStar } from 'react-icons/fa';
import { MdVerified } from 'react-icons/md';

const ProducerDetail = () => {
    const { nom } = useParams();
    const { ajouterAuPanier } = useCart();
    const { toggleFavori, estFavori } = useWishlist();

    const nomDecoded = decodeURIComponent(nom);
    const producteur = getProducteurByNom(nomDecoded);
    const produits = getProduitsByProducteur(nomDecoded);

    if (!producteur) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center bg-[#fdf6ec] px-4 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <h2 className="text-2xl font-bold font-serif text-[#2c2c2c] mb-3">
                    Producteur introuvable
                </h2>
                <Link
                    to="/producteurs"
                    className="bg-emerald-600 text-white font-bold px-8 py-3 rounded-full no-underline hover:bg-emerald-500 transition-colors duration-300"
                >
                    Voir tous les producteurs
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-[#fdf6ec] min-h-screen py-12">
            <div className="container mx-auto px-4">

                {/* FIL D'ARIANE */}
                <div className="flex items-center gap-2 text-sm text-black/50 mb-8">
                    <Link to="/" className="hover:text-emerald-600 no-underline transition-colors">Accueil</Link>
                    <span>›</span>
                    <Link to="/producteurs" className="hover:text-emerald-600 no-underline transition-colors">Producteurs</Link>
                    <span>›</span>
                    <span className="text-[#2c2c2c] font-semibold">{producteur.nom}</span>
                </div>

                {/* CARTE PROFIL */}
                <div className="bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.07)] overflow-hidden mb-8">

                    {/* BANDEAU VERT */}
                    <div className="h-16 bg-gradient-to-r from-emerald-600 to-teal-600 relative">
                    <div className="absolute inset-0 opacity-20" style={{
                        backgroundImage: 'radial-gradient(circle at 20px 20px, white 2px, transparent 0)',
                        backgroundSize: '40px 40px'
                    }} />
                </div>

                <div className="px-8 pb-8">
                    {/* AVATAR */}
                <div className="flex items-end justify-between -mt-10 mb-6">
                <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center text-4xl border-4 border-white">
                                {producteur.icone}
                            </div>
                            <div className="flex gap-2 mb-2">
                                {producteur.certifications.map((cert) => (
                                    <span key={cert} className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                                        <MdVerified size={12} /> {cert}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* INFOS */}
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-3xl font-bold font-serif text-[#2c2c2c] mb-1">
                                    {producteur.nom}
                                </h1>
                                <p className="text-black/50 text-sm mb-3">
                                    📍 {producteur.region} · 🌿 {producteur.specialite} · Membre depuis {producteur.membreDepuis}
                                </p>
                                <p className="text-black/60 text-sm leading-relaxed max-w-2xl">
                                    {producteur.description}
                                </p>
                            </div>

                            {/* STATS */}
                            <div className="shrink-0 flex gap-6 ml-8">
                                <div className="text-center">
                                    <div className="text-2xl font-black text-emerald-600">{producteur.note}</div>
                                    <div className="text-xs text-black/40">Note</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-black text-emerald-600">{producteur.nbAvis}</div>
                                    <div className="text-xs text-black/40">Avis</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-black text-emerald-600">{produits.length}</div>
                                    <div className="text-xs text-black/40">Produits</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* LOCALISATION */}
                <div className="bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.07)] p-6 mb-8">
                    <h2 className="text-xl font-bold font-serif text-[#2c2c2c] mb-4">
                        📍 Localisation
                    </h2>
                    <div className="bg-[#ecfdf5] rounded-xl h-48 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-5xl mb-3">🗺️</div>
                            <p className="font-bold text-emerald-700">{producteur.region}, Tunisie</p>
                            <p className="text-sm text-black/40 mt-1">Carte interactive disponible avec Google Maps API</p>
                        </div>
                    </div>
                </div>

                {/* PRODUITS */}
                {produits.length > 0 && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold font-serif text-[#2c2c2c] mb-6">
                            Produits de {producteur.nom}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {produits.map((produit) => (
                                <div
                                    key={produit.id}
                                    className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.07)] border-2 border-transparent hover:border-emerald-500 hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                                >
                                    <Link to={`/produits/${produit.id}`} className="no-underline">
                                        <div className="relative h-44 bg-[#ecfdf5] flex items-center justify-center">
                                            <span className="text-6xl">{produit.image}</span>
                                            <span className="absolute bottom-3 right-3 bg-white/90 text-xs font-bold px-3 py-1 rounded-full">
                                                ⭐ {produit.note}
                                            </span>
                                        </div>
                                    </Link>
                                    <div className="p-4">
                                        <div className="flex items-start justify-between mb-2">
                                            <Link to={`/produits/${produit.id}`} className="no-underline flex-1">
                                                <h3 className="text-sm font-bold text-[#2c2c2c] hover:text-emerald-600 transition-colors duration-200">
                                                    {produit.nom}
                                                </h3>
                                            </Link>
                                            <button
                                                onClick={() => toggleFavori(produit)}
                                                className="ml-2 p-1.5 rounded-full hover:bg-red-50 transition-colors duration-200 shrink-0"
                                            >
                                                {estFavori(produit.id)
                                                    ? <FaHeart size={16} className="text-red-500" />
                                                    : <FiHeart size={16} className="text-gray-400" />
                                                }
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                            <span className="text-lg font-extrabold text-emerald-600">
                                                {formatPrice(produit.prix)}
                                            </span>
                                            <button
                                                onClick={() => ajouterAuPanier(produit)}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors duration-300"
                                            >
                                                Ajouter
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* AVIS */}
                <div className="bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.07)] p-6">
                    <h2 className="text-2xl font-bold font-serif text-[#2c2c2c] mb-6">
                        Avis clients
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {producteur.avis.map((avis) => (
                            <div key={avis.id} className="bg-[#f9f5f0] rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-sm text-[#2c2c2c]">{avis.auteur}</span>
                                    <span className="text-xs text-black/40">{avis.date}</span>
                                </div>
                                <div className="flex gap-0.5 mb-2">
                                    {[...Array(5)].map((_, i) => (
                                        <FaStar
                                            key={i}
                                            size={12}
                                            className={i < avis.note ? 'text-yellow-400' : 'text-gray-200'}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm text-black/60 leading-relaxed">
                                    "{avis.commentaire}"
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ProducerDetail;