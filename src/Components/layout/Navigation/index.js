import { Link, useLocation } from 'react-router-dom';
import { FaHome } from "react-icons/fa";
import { AiFillProduct } from "react-icons/ai";
import { GiTalk } from "react-icons/gi";
import { RiDiscountPercentLine } from "react-icons/ri";

const navLinks = [
    { label: 'Accueil', url: '/', icone: <FaHome size={16} /> },
    { label: 'Tous les Produits', url: '/produits', icone: <AiFillProduct size={16} /> },
    { label: 'Offres', url: '/offres', icone: <RiDiscountPercentLine size={16} /> },
    { label: 'FAQ', url: '/faq', icone: <GiTalk size={16} /> },
];

const Navigation = () => {
    const location = useLocation();

    return (
        <nav className="bg-white border-b border-gray-100 shadow-sm">
            <div className="container mx-auto px-4">
                <div className="flex items-center justify-center space-x-10 py-4">
                    {navLinks.map((lien) => {
                        const estActif = location.pathname === lien.url;
                        return (
                            <Link
                                key={lien.label}
                                to={lien.url}
                                className={`flex items-center gap-2 text-base font-semibold tracking-wide pb-2 border-b-2 transition-all duration-200 no-underline ${
                                    estActif
                                        ? 'text-emerald-600 border-emerald-600'
                                        : 'text-gray-500 border-transparent hover:text-emerald-600 hover:border-emerald-600'
                                }`}
                            >
                                {lien.icone}
                                {lien.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default Navigation;