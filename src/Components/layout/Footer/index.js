import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useState } from 'react';

const Footer = () => {
    const [email, setEmail] = useState('');

    const handleNewsletter = (e) => {
        e.preventDefault();
        if (email) {
            alert(`Merci ! ${email} a été inscrit à la newsletter.`);
            setEmail('');
        }
    };

    return (
        <footer className="bg-[#064e3b] text-white pt-16 pb-6">
            <div className="container mx-auto px-4">

                {/* GRILLE PRINCIPALE */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">

                    {/* MARQUE */}
                    <div className="md:col-span-1">
                        <h3 className="text-3xl font-bold font-serif mb-3">GOFFA</h3>
                        <p className="text-white/60 text-sm leading-relaxed mb-5">
                            Votre plateforme e-commerce de produits artisanaux et naturels en Tunisie.
                        </p>
                        <div className="flex gap-3">
                            <button
                                aria-label="Facebook"
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-colors duration-300"
                            >
                                <FaFacebook size={16} /> Facebook
                            </button>
                            <button
                                aria-label="Instagram"
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-colors duration-300"
                            >
                                <FaInstagram size={16} /> Instagram
                            </button>
                            <button
                                aria-label="Twitter / X"
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 transition-colors duration-300"
                            >
                                <FaXTwitter size={16} />
                            </button>
                        </div>
                    </div>

                    {/* NAVIGATION */}
                    <div>
                        <h4 className="text-[#a8d5a2] font-bold text-sm mb-4 uppercase tracking-wide">
                            Navigation
                        </h4>
                        <ul className="space-y-2 list-none p-0 m-0">
                            {[
                                { label: 'Accueil', url: '/' },
                                { label: 'Tous les produits', url: '/produits' },
                                { label: 'Nouveautés', url: '/produits?tri=nouveau' },
                                { label: 'Recettes', url: '/recettes' },
                                { label: 'Contact', url: '/contact' },
                            ].map((lien) => (
                                <li key={lien.label}>
                                    <Link
                                        to={lien.url}
                                        className="text-white/60 hover:text-white text-sm transition-colors duration-200 no-underline"
                                    >
                                        {lien.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* AIDE */}
                    <div>
                        <h4 className="text-[#a8d5a2] font-bold text-sm mb-4 uppercase tracking-wide">
                            Aide & Support
                        </h4>
                        <ul className="space-y-2 list-none p-0 m-0">
                            {[
                                { label: 'FAQ', url: '/faq' },
                                { label: 'Contact', url: '/contact' },
                                { label: 'Livraison', url: '/livraison' },
                                { label: 'Retours', url: '/retours' },
                                { label: 'Mentions légales', url: '/mentions-legales' },
                            ].map((lien) => (
                                <li key={lien.label}>
                                    <Link
                                        to={lien.url}
                                        className="text-white/60 hover:text-white text-sm transition-colors duration-200 no-underline"
                                    >
                                        {lien.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* NEWSLETTER */}
                    <div>
                        <h4 className="text-[#a8d5a2] font-bold text-sm mb-4 uppercase tracking-wide">
                            Newsletter
                        </h4>
                        <p className="text-white/60 text-sm mb-4">
                            Inscrivez-vous et recevez nos offres exclusives
                        </p>
                        <form onSubmit={handleNewsletter} className="flex">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Votre email"
                                className="flex-1 bg-white/10 border border-white/20 text-white placeholder-white/40 px-4 py-3 rounded-l-xl outline-none text-sm focus:bg-white/15 transition-colors duration-200"
                            />
                            <button
                                type="submit"
                                className="bg-[#059669] hover:bg-[#047857] text-white font-bold px-5 py-3 rounded-r-xl transition-colors duration-300"
                            >
                                OK
                            </button>
                        </form>
                    </div>

                </div>

                {/* BAS DE PAGE */}
                <div className="border-t border-white/10 pt-5 text-center text-white/40 text-xs">
                    © 2026 GOFFA — Plateforme e-commerce artisanale | Tous droits réservés
                </div>

            </div>
        </footer>
    );
};

export default Footer;