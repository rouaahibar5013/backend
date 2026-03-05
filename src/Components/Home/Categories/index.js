import { Link } from 'react-router-dom';
import categories from '../../../data/categories';

const Categories = () => {
    return (
        <section className="bg-white py-16">
            <div className="container mx-auto px-4">

                {/* TITRE */}
                <div className="text-center mb-10">
                    <h2 className="text-4xl font-bold font-serif text-[#2c2c2c] mb-2">
                        Nos Catégories
                    </h2>
                    <p className="text-black/50 text-base">
                        Explorez notre gamme complète de produits bio
                    </p>
                </div>

                {/* GRILLE */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    {categories.map((cat) => (
                        <Link
                            key={cat.id}
                            to={`/produits?categorie=${cat.nom}`}
                            className="group bg-[#f9f5f0] rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 hover:bg-[#059669] hover:-translate-y-1 hover:shadow-xl no-underline"
                        >
                            <div className="text-5xl mb-3">{cat.icone}</div>
                            <h3 className="text-sm font-bold text-[#2c2c2c] group-hover:text-white mb-2 transition-colors duration-300">
                                {cat.nom}
                            </h3>
                            <span className="text-xs text-black/50 bg-black/6 group-hover:text-white group-hover:bg-white/20 px-3 py-1 rounded-full transition-colors duration-300">
                                {cat.count} produits
                            </span>
                        </Link>
                    ))}
                </div>

            </div>
        </section>
    );
};

export default Categories;