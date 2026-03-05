import './App.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './Components/layout/Layout';
import Home from './Pages/Home';
import Cart from './Pages/Cart';
import NotFound from './Pages/NotFound';
import Products from './Pages/Products';
import ProductDetail from './Pages/ProductDetail';
import Wishlist from './Pages/Wishlist';
import Producers from './Pages/Producers';
import ProducerDetail from './Pages/ProducerDetail';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <WishlistProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/produits" element={<Products />} />
              <Route path="/produits/:id" element={<ProductDetail />} />
              <Route path="/panier" element={<Cart />} />
              <Route path="/favoris" element={<Wishlist />} />
              <Route path="/producteurs" element={<Producers />} />
              <Route path="/producteurs/:nom" element={<ProducerDetail />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </WishlistProvider>
      </CartProvider>
    </BrowserRouter>
  );
}

export default App;