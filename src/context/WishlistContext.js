import { createContext, useContext, useState } from 'react';

const WishlistContext = createContext();

export const WishlistProvider = ({ children }) => {
    const [favoris, setFavoris] = useState([]);

    const ajouterFavori = (produit) => {
        setFavoris((prev) => {
            const existe = prev.find((p) => p.id === produit.id);
            if (existe) return prev;
            return [...prev, produit];
        });
    };

    const retirerFavori = (id) => {
        setFavoris((prev) => prev.filter((p) => p.id !== id));
    };

    const toggleFavori = (produit) => {
        const existe = favoris.find((p) => p.id === produit.id);
        if (existe) {
            retirerFavori(produit.id);
        } else {
            ajouterFavori(produit);
        }
    };

    const estFavori = (id) => favoris.some((p) => p.id === id);

    const totalFavoris = favoris.length;

    return (
        <WishlistContext.Provider value={{
            favoris,
            toggleFavori,
            retirerFavori,
            estFavori,
            totalFavoris,
        }}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => {
    const context = useContext(WishlistContext);
    if (!context) {
        throw new Error('useWishlist doit être utilisé dans un WishlistProvider');
    }
    return context;
};

export default WishlistContext;