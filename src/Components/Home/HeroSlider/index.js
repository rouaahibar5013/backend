import React, { useState, useEffect } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { Link } from "react-router-dom";
import slides from "../../../data/slides";

const HeroSlider = () => {
    const [current, setCurrent] = useState(0);
    const [animating, setAnimating] = useState(false);

    useEffect(() => {
    const timer = setInterval(() => {
        setCurrent((prev) => (prev + 1) % slides.length);
    }, 8000);
    return () => clearInterval(timer);
}, []);

    const allerVers = (index) => {
        if (animating) return;
        setAnimating(true);
        setTimeout(() => {
            setCurrent(index);
            setAnimating(false);
        }, 400);
    };

    const suivant = () => allerVers((current + 1) % slides.length);
    const precedent = () => allerVers((current - 1 + slides.length) % slides.length);

    const slide = slides[current];

    return (
        <div className="relative w-full h-[75vh] overflow-hidden">

            {/* IMAGE DE FOND */}
            <div
                className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${animating ? 'opacity-0' : 'opacity-100'}`}
                style={{ backgroundImage: `url(${slide.image})` }}
            />

            {/* OVERLAY GRADIENT — plus stylé qu'un simple noir */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

            {/* CONTENU — aligné à gauche */}
            <div className="relative h-full flex items-center px-16">
                <div className={`max-w-xl transition-all duration-500 ${animating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>

                    {/* BADGE */}
                    <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/25 rounded-full px-4 py-2 mb-6">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-white/90 text-sm font-semibold tracking-widest uppercase">
                            {slide.sousTitre}
                        </span>
                    </div>

                    {/* TITRE */}
                    <h1 className="text-white text-6xl font-black font-serif mb-5 leading-tight drop-shadow-lg">
                        {slide.titre}
                    </h1>

                    {/* LIGNE DÉCORATIVE */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-12 h-1 bg-emerald-400 rounded-full"></div>
                        <div className="w-4 h-1 bg-[#c8872a] rounded-full"></div>
                        <div className="w-2 h-1 bg-white/40 rounded-full"></div>
                    </div>

                    {/* DESCRIPTION */}
                    <p className="text-white/80 text-lg mb-8 leading-relaxed">
                        {slide.description}
                    </p>

                    {/* BOUTONS */}
                    <div className="flex items-center gap-4">
                        <Link
                            to={slide.url}
                            className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold text-base transition-all duration-300 no-underline shadow-lg hover:shadow-emerald-500/30 hover:scale-105"
                        >
                            {slide.cta}
                            <span>→</span>
                        </Link>
                        <Link
                            to="/produits"
                            className="inline-flex items-center gap-2 px-8 py-4 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white border border-white/30 rounded-full font-bold text-base transition-all duration-300 no-underline"
                        >
                            Tout voir
                        </Link>
                    </div>

                </div>
            </div>

            {/* CADRE DÉCORATIF EN BAS */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-[#c8872a] to-emerald-500 opacity-60" />

            {/* COMPTEUR DE SLIDE — en bas à droite */}
            <div className="absolute bottom-8 right-16 flex items-center gap-3">
                <span className="text-white font-black text-3xl font-serif">
                    {String(current + 1).padStart(2, '0')}
                </span>
                <div className="w-12 h-0.5 bg-white/40">
                    <div
                        className="h-full bg-white transition-all duration-300"
                        style={{ width: `${((current + 1) / slides.length) * 100}%` }}
                    />
                </div>
                <span className="text-white/40 font-bold text-lg">
                    {String(slides.length).padStart(2, '0')}
                </span>
            </div>

            {/* FLÈCHES */}
            <button
                onClick={precedent}
                aria-label="Slide précédent"
                className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-sm border border-white/25 rounded-full w-12 h-12 flex items-center justify-center text-white hover:bg-emerald-600 hover:border-emerald-600 transition-all duration-300"
            >
                <FaChevronLeft size={14} />
            </button>
            <button
                onClick={suivant}
                aria-label="Slide suivant"
                className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-sm border border-white/25 rounded-full w-12 h-12 flex items-center justify-center text-white hover:bg-emerald-600 hover:border-emerald-600 transition-all duration-300"
            >
                <FaChevronRight size={14} />
            </button>

            {/* POINTS DE NAVIGATION */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
                {slides.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => allerVers(index)}
                        aria-label={`Aller au slide ${index + 1}`}
                        className={`transition-all duration-300 rounded-full border-none ${
                            index === current
                                ? 'bg-emerald-400 w-8 h-2'
                                : 'bg-white/30 hover:bg-white/60 w-2 h-2'
                        }`}
                    />
                ))}
            </div>

        </div>
    );
};

export default HeroSlider;