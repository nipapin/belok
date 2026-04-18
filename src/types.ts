export enum MenuLabel {
    HOME = "Главная",
    MENU = "Меню",
    CART = "Корзина",
    PROFILE = "Профиль",
}

export interface Product {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image: string | null;
    calories: number | null;
    proteins: number | null;
    category: { name: string };
}

export interface Category {
    id: string;
    name: string;
    image: string | null;
    _count: { products: number };
}