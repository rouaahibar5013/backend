import HeroSlider from '../../Components/Home/HeroSlider';
import Categories from '../../Components/Home/Categories';
import NewProducts from '../../Components/Home/NewProducts';
import TrendingProducts from '../../Components/Home/TrendingProducts';
import Banniere from '../../Components/Home/Banniere';

const Home = () => {
    return (
        <>
            <HeroSlider />
            <Categories />
            <NewProducts />
            <TrendingProducts />
            <Banniere />
        </>
    );
};

export default Home;