import { Link } from 'react-router-dom';

const Banniere = () => (
    <section className="py-16 bg-gradient-to-b from-green-100 to-white">
        <div className="container mx-auto px-4">
            <div className="bg-gradient-to-r from-green-900 via-emerald-800 to-teal-900 rounded-3xl p-12 flex items-center justify-between text-white shadow-2xl overflow-hidden relative">

                {/* MOTIF DE FOND */}
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0" style={{
                        backgroundImage: 'radial-gradient(circle at 20px 20px, white 2px, transparent 0)',
                        backgroundSize: '40px 40px'
                    }}></div>
                </div>

                {/* TEXTE */}
                <div className="relative z-10">
                    <div className="inline-block bg-yellow-400 text-green-900 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        🌱 Engagement Bio
                    </div>
                    <h3 className="text-4xl font-black mb-3">
                        Soutenez nos Producteurs Locaux
                    </h3>
                    <p className="text-xl text-green-50 mb-6 max-w-xl">
                        Chaque achat contribue au développement de l'agriculture biologique en Tunisie
                    </p>
                    <Link
                        to="/producteurs"
                        className="inline-block bg-white text-green-600 px-8 py-4 rounded-full font-bold hover:bg-green-50 transition shadow-xl no-underline"
                    >
                         Découvrir nos producteurs
                    </Link>
                </div>

                {/* ICÔNE */}
                <div className="text-9xl relative z-10">
                    🚜
                </div>

            </div>
        </div>
    </section>
);

export default Banniere;