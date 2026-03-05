import { Link } from 'react-router-dom';

const NotFound = () => {
    return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center bg-[#fdf6ec] px-4 text-center">

            {/* NUMÉRO */}
            <h1 className="text-[150px] font-black font-serif text-[#059669] leading-none mb-4">
                404
            </h1>

            {/* ICÔNE */}
            <div className="text-6xl mb-6">🌿</div>

            {/* TEXTE */}
            <h2 className="text-3xl font-bold font-serif text-[#2c2c2c] mb-3">
                Page introuvable
            </h2>
            <p className="text-black/50 text-base max-w-md mb-8">
                La page que vous cherchez n'existe pas ou a été déplacée.
                Retournez à l'accueil pour continuer vos achats.
            </p>

            {/* BOUTONS */}
            <div className="flex gap-4">
                <Link
                    to="/"
                    className="bg-[#059669] hover:bg-[#047857] text-white font-bold px-8 py-3 rounded-full transition-colors duration-300 no-underline"
                >
                    Retour à l'accueil
                </Link>
                <Link
                    to="/produits"
                    className="border-2 border-[#059669] text-[#059669] hover:bg-[#059669] hover:text-white font-bold px-8 py-3 rounded-full transition-colors duration-300 no-underline"
                >
                    Voir les produits
                </Link>
            </div>

        </div>
    );
};

export default NotFound;