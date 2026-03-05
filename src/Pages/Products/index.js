import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { nouveautes, tendances } from '../../data/products';
import categories from '../../data/categories';
import formatPrice from '../../utils/formatPrice';
import { BsStars } from "react-icons/bs";
import { FiHeart } from 'react-icons/fi';
import { FaHeart } from 'react-icons/fa';

const tousProduits = [...nouveautes, ...tendances];

const Products = () => {
    const { ajouterAuPanier } = useCart();
    const { toggleFavori, estFavori } = useWishlist();
    const [categorieActive, setCategorieActive] = useState('Tous');
    const [tri, setTri] = useState('defaut');
    const [prixMin, setPrixMin] = useState('');
    const [prixMax, setPrixMax] = useState('');
    const [noteMin, setNoteMin] = useState(0);

    const produitsFiltres = tousProduits
        .filter((p) => {
            const matchCategorie = categorieActive === 'Tous' || p.region === categorieActive;
            const matchPrixMin = prixMin === '' || p.prix >= parseFloat(prixMin);
            const matchPrixMax = prixMax === '' || p.prix <= parseFloat(prixMax);
            const matchNote = p.note >= noteMin;
            return matchCategorie && matchPrixMin && matchPrixMax && matchNote;
        })
        .sort((a, b) => {
            if (tri === 'prix-asc') return a.prix - b.prix;
            if (tri === 'prix-desc') return b.prix - a.prix;
            if (tri === 'note') return b.note - a.note;
            return 0;
        });

    const resetFiltres = () => {
        setCategorieActive('Tous');
        setTri('defaut');
        setPrixMin('');
        setPrixMax('');
        setNoteMin(0);
    };

    return (
        <div className="bg-[#fdf6ec] min-h-screen py-12">
            <div className="container mx-auto px-4">

                {/* TITRE */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-bold font-serif text-[#2c2c2c] mb-1">
                            Tous les Produits
                        </h1>
                        <p className="text-black/50">
                            {produitsFiltres.length} produit{produitsFiltres.length > 1 ? 's' : ''} trouvé{produitsFiltres.length > 1 ? 's' : ''}
                        </p>
                    </div>
                    <button className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-6 py-3 rounded-full shadow-lg hover:shadow-emerald-300/40 transition-all duration-300 group">
                        <BsStars size={18} className="group-hover:animate-spin" />
                        Recherche IA
                    </button>
                </div>

                <div className="flex gap-6">

                    {/* SIDEBAR FILTRES */}
                    <div className="w-64 shrink-0">
                        <div className="bg-white rounded-2xl p-5 shadow-[0_4px_15px_rgba(0,0,0,0.07)] sticky top-4">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-bold text-[#2c2c2c] text-base">Filtres</h3>
                                <button onClick={resetFiltres} className="text-xs text-emerald-600 hover:underline font-semibold">
                                    Réinitialiser
                                </button>
                            </div>

                            {/* TRI */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-black/40 uppercase tracking-wider mb-3">Trier par</h4>
                                <select
                                    value={tri}
                                    onChange={(e) => setTri(e.target.value)}
                                    className="w-full bg-[#f9f5f0] rounded-xl px-4 py-2.5 text-sm font-semibold text-[#2c2c2c] outline-none cursor-pointer"
                                >
                                    <option value="defaut">Par défaut</option>
                                    <option value="prix-asc">Prix croissant</option>
                                    <option value="prix-desc">Prix décroissant</option>
                                    <option value="note">Meilleures notes</option>
                                </select>
                            </div>

                            {/* PRIX */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-black/40 uppercase tracking-wider mb-3">Prix (DT)</h4>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={prixMin}
                                        onChange={(e) => setPrixMin(e.target.value)}
                                        className="w-full bg-[#f9f5f0] rounded-xl px-3 py-2.5 text-sm outline-none text-[#2c2c2c] placeholder-black/30"
                                    />
                                    <span className="text-black/30 font-bold">—</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={prixMax}
                                        onChange={(e) => setPrixMax(e.target.value)}
                                        className="w-full bg-[#f9f5f0] rounded-xl px-3 py-2.5 text-sm outline-none text-[#2c2c2c] placeholder-black/30"
                                    />
                                </div>
                            </div>

                            {/* NOTE */}
                            <div className="mb-6">
                                <h4 className="text-xs font-bold text-black/40 uppercase tracking-wider mb-3">Note minimale</h4>
                                <div className="flex flex-col gap-2">
                                    {[0, 3, 4, 4.5, 5].map((note) => (
                                        <button
                                            key={note}
                                            onClick={() => setNoteMin(note)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                                                noteMin === note
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-[#f9f5f0] text-black/60 hover:bg-[#d1fae5] hover:text-emerald-600'
                                            }`}
                                        >
                                            {note === 0 ? 'Toutes les notes' : `${'⭐'.repeat(Math.floor(note))} ${note}+`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* CATÉGORIES */}
                            <div>
                                <h4 className="text-xs font-bold text-black/40 uppercase tracking-wider mb-3">Catégories</h4>
                                <div className="flex flex-col gap-1.5">
                                    <button
                                        onClick={() => setCategorieActive('Tous')}
                                        className={`text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                                            categorieActive === 'Tous'
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-[#f9f5f0] text-black/60 hover:bg-[#d1fae5] hover:text-emerald-600'
                                        }`}
                                    >
                                        Toutes les catégories
                                    </button>
                                    {categories.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setCategorieActive(cat.nom)}
                                            className={`text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                                                categorieActive === cat.nom
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-[#f9f5f0] text-black/60 hover:bg-[#d1fae5] hover:text-emerald-600'
                                            }`}
                                        >
                                            {cat.icone} {cat.nom}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* GRILLE PRODUITS */}
                    <div className="flex-1">
                        {produitsFiltres.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="text-6xl mb-4">🔍</div>
                                <h3 className="text-xl font-bold text-[#2c2c2c] mb-2">Aucun produit trouvé</h3>
                                <p className="text-black/50 mb-6">Essayez avec d'autres filtres</p>
                                <button
                                    onClick={resetFiltres}
                                    className="bg-emerald-600 text-white font-bold px-6 py-3 rounded-full hover:bg-emerald-500 transition-colors duration-300"
                                >
                                    Réinitialiser les filtres
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {produitsFiltres.map((produit) => (
                                    <div
                                        key={produit.id}
                                        className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.07)] border-2 border-transparent hover:border-emerald-500 hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                                    >
                                        {/* IMAGE */}
                                        <Link to={`/produits/${produit.id}`} className="no-underline">
                                            <div className="relative h-44 bg-[#ecfdf5] flex items-center justify-center cursor-pointer">
                                                <span className="text-6xl">{produit.image}</span>
                                                <span className="absolute bottom-3 right-3 bg-white/90 text-xs font-bold px-3 py-1 rounded-full">
                                                    ⭐ {produit.note}
                                                </span>
                                            </div>
                                        </Link>

                                        {/* INFOS */}
                                        <div className="p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <Link to={`/produits/${produit.id}`} className="no-underline flex-1">
                                                    <h3 className="text-sm font-bold text-[#2c2c2c] hover:text-emerald-600 transition-colors duration-200">
                                                        {produit.nom}
                                                    </h3>
                                                </Link>
                                                {/* BOUTON COEUR */}
                                                <button
                                                    onClick={() => toggleFavori(produit)}
                                                    className="ml-2 p-1.5 rounded-full hover:bg-red-50 transition-colors duration-200 shrink-0"
                                                    aria-label="Ajouter aux favoris"
                                                >
                                                    {estFavori(produit.id)
                                                        ? <FaHeart size={16} className="text-red-500" />
                                                        : <FiHeart size={16} className="text-gray-400 hover:text-red-400" />
                                                    }
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                                                <Link
                                                    to={`/producteurs/${encodeURIComponent(produit.producteur)}`}
                                                    className="bg-[#d1fae5] text-emerald-600 text-xs font-bold px-3 py-1 rounded-full no-underline hover:bg-emerald-200 transition-colors duration-200"
                                                >
                                                    {produit.producteur}
                                                </Link>
                                                <span className="text-xs text-black/50">
                                                    📍 {produit.region}
                                                </span>
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
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Products;