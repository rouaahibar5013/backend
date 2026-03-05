import { Link } from 'react-router-dom';
import { producteurs } from '../../data/producers';
import { MdVerified } from 'react-icons/md';
import { FaStar } from 'react-icons/fa';

const Producers = () => {
    return (
        <div className="bg-[#fdf6ec] min-h-screen py-12">
            <div className="container mx-auto px-4">

                {/* TITRE */}
                <div className="text-center mb-12">
                    <span className="bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full inline-block mb-3">
                        🌱 NOS PRODUCTEURS
                    </span>
                    <h1 className="text-4xl font-bold font-serif text-[#2c2c2c] mb-2">
                        Rencontrez nos Artisans
                    </h1>
                    <p className="text-black/50 max-w-xl mx-auto">
                        Des producteurs passionnés qui cultivent et fabriquent avec amour les meilleurs produits de Tunisie
                    </p>
                </div>

                {/* GRILLE */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {producteurs.map((producteur) => (
                        <Link
                            key={producteur.id}
                            to={`/producteurs/${encodeURIComponent(producteur.nom)}`}
                            className="no-underline group"
                        >
                            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_15px_rgba(0,0,0,0.07)] border-2 border-transparent group-hover:border-emerald-500 group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-300">

                                {/* BANDEAU */}
                                <div className="h-16 bg-gradient-to-r from-emerald-600 to-teal-600 relative">
                                    <div className="absolute inset-0 opacity-20" style={{
                                        backgroundImage: 'radial-gradient(circle at 20px 20px, white 2px, transparent 0)',
                                        backgroundSize: '40px 40px'
                                    }} />
                                </div>

                                <div className="px-5 pb-5">
                                    {/* AVATAR */}
                                    <div className="flex items-end justify-between -mt-8 mb-4">
    <div className="w-14 h-14 bg-white rounded-xl shadow-md flex items-center justify-center text-2xl border-4 border-white">
                                            {producteur.icone}
                                        </div>
                                        <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full mb-1">
                                            <FaStar size={12} className="text-yellow-400" />
                                            <span className="text-xs font-bold text-yellow-700">{producteur.note}</span>
                                        </div>
                                    </div>

                                    {/* INFOS */}
                                    <h3 className="text-lg font-bold text-[#2c2c2c] mb-1 group-hover:text-emerald-600 transition-colors duration-200">
                                        {producteur.nom}
                                    </h3>
                                    <p className="text-xs text-black/50 mb-3">
                                        📍 {producteur.region} · {producteur.specialite}
                                    </p>
                                    <p className="text-sm text-black/60 leading-relaxed mb-4 line-clamp-2">
                                        {producteur.description}
                                    </p>

                                    {/* CERTIFICATIONS */}
                                    <div className="flex gap-2 mb-4 flex-wrap">
                                        {producteur.certifications.map((cert) => (
                                            <span key={cert} className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                                <MdVerified size={10} /> {cert}
                                            </span>
                                        ))}
                                    </div>

                                    {/* STATS */}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <span className="text-xs text-black/40">{producteur.nbAvis} avis</span>
                                        <span className="bg-emerald-600 group-hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors duration-300">
                                            Voir le profil →
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>
        </div>
    );
};

export default Producers;