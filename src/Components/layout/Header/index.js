import { Link } from 'react-router-dom';
import { FiUser } from "react-icons/fi";
import { BsFillBasket3Fill } from "react-icons/bs";
import { FaAngleDown } from "react-icons/fa6";
import { FiHeart } from "react-icons/fi";
import { useCart } from '../../../context/CartContext';
import { useWishlist } from '../../../context/WishlistContext';
import formatPrice from '../../../utils/formatPrice';

const Logo = () => (
    <Link to="/" className="shrink-0 no-underline flex items-center gap-2">
        <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 16 Q14 8 21 8 Q28 8 28 16" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
            <rect x="8" y="16" width="26" height="20" rx="4" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="2"/>
            <path d="M21 20 L25 24 L21 28 L17 24 Z" fill="white" fillOpacity="0.6"/>
            <circle cx="12" cy="22" r="1.2" fill="white" fillOpacity="0.7"/>
            <circle cx="30" cy="22" r="1.2" fill="white" fillOpacity="0.7"/>
            <circle cx="12" cy="28" r="1.2" fill="white" fillOpacity="0.7"/>
            <circle cx="30" cy="28" r="1.2" fill="white" fillOpacity="0.7"/>
            <path d="M16 16 L26 16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <div className="flex flex-col leading-none">
            <span className="text-white font-black text-2xl tracking-widest font-serif">GOFFA</span>
            <span className="text-white/60 text-xs tracking-wider">artisanat tunisien</span>
        </div>
    </Link>
);

const Header = () => {
    const { totalArticles, totalPrix } = useCart();
    const { totalFavoris } = useWishlist();

    return (
        <div className="bg-emerald-600">
            <header className="container mx-auto px-4">
                <div className="flex items-center py-3 gap-4">

                    <Logo />

                    <button className="flex items-center gap-2 border border-white/30 rounded-xl px-4 py-2 text-white shrink-0 hover:bg-white/10 transition">
                        <div className="flex flex-col text-left">
                            <span className="text-white/70 text-xs">Votre région</span>
                            <span className="text-white font-bold text-sm">Tunisie</span>
                        </div>
                        <FaAngleDown className="text-white/80 ml-1" />
                    </button>

                    <div className="flex-1 flex items-center bg-white/15 border border-white/30 rounded-full px-4 py-2 gap-2">
                        <input
                            type="text"
                            placeholder="Rechercher un produit, producteur..."
                            className="flex-1 bg-transparent outline-none text-white placeholder-white/60 text-sm"
                        />
                        <button className="bg-white/20 hover:bg-white/30 text-white rounded-full w-8 h-8 flex items-center justify-center transition">
                            🔍
                        </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">

                        {/* FAVORIS */}
                        <Link to="/favoris" className="relative no-underline">
                            <button className="border border-white/30 rounded-full w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 transition group">
                                <FiHeart size={20} className="group-hover:text-red-300 transition" />
                            </button>
                            {totalFavoris > 0 && (
                                <span className="absolute -top-1.5 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                    {totalFavoris}
                                </span>
                            )}
                        </Link>

                        {/* COMPTE */}
                        <button className="border border-white/30 rounded-full w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 transition">
                            <FiUser size={20} />
                        </button>

                        {/* PANIER */}
                        <Link to="/panier" className="flex items-center gap-2 no-underline">
                            <span className="text-white font-bold text-sm">
                                {formatPrice(totalPrix)}
                            </span>
                            <div className="relative">
                                <button className="border border-white/30 bg-white/15 rounded-full w-10 h-10 flex items-center justify-center text-white hover:bg-white/20 transition">
                                    <BsFillBasket3Fill size={18} />
                                </button>
                                {totalArticles > 0 && (
                                    <span className="absolute -top-1.5 -right-1 bg-[#c8872a] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                        {totalArticles}
                                    </span>
                                )}
                            </div>
                        </Link>

                    </div>
                </div>
            </header>
        </div>
    );
};

export default Header;