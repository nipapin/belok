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
  fats: number | null;
  carbs: number | null;
  fiber: number | null;
  categoryId: string;
  category: { id: string; name: string };
  ingredients: ProductIngredient[];
}

export interface Category {
  id: string;
  name: string;
  image: string | null;
  _count: { products: number };
}

export interface ProductIngredient {
  id: string;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
  ingredient: {
    id: string;
    name: string;
    price: number;
  };
}
