import { createContext, useContext, useState } from 'react';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const [panier, setPanier] = useState([]);

    // Ajouter un produit
    const ajouterAuPanier = (produit) => {
        setPanier((prev) => {
            const existe = prev.find((item) => item.id === produit.id);
            if (existe) {
                return prev.map((item) =>
                    item.id === produit.id
                        ? { ...item, quantite: item.quantite + 1 }
                        : item
                );
            }
            return [...prev, { ...produit, quantite: 1 }];
        });
    };

    // Retirer un produit
    const retirerDuPanier = (id) => {
        setPanier((prev) => prev.filter((item) => item.id !== id));
    };

    // Changer la quantité
    const changerQuantite = (id, quantite) => {
        if (quantite < 1) {
            retirerDuPanier(id);
            return;
        }
        setPanier((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, quantite } : item
            )
        );
    };

    // Vider le panier
    const viderPanier = () => setPanier([]);

    // Total articles
    const totalArticles = panier.reduce((acc, item) => acc + item.quantite, 0);

    // Total prix
    const totalPrix = panier.reduce(
        (acc, item) => acc + item.prix * item.quantite, 0
    );

    return (
        <CartContext.Provider value={{
            panier,
            ajouterAuPanier,
            retirerDuPanier,
            changerQuantite,
            viderPanier,
            totalArticles,
            totalPrix,
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart doit être utilisé dans un CartProvider');
    }
    return context;
};

export default CartContext;