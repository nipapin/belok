export type Role = 'USER' | 'ADMIN';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'CANCELLED';
export type BonusType = 'EARNED' | 'SPENT' | 'EXPIRED' | 'MANUAL';
export type IngredientAction = 'ADD' | 'REMOVE';
export type VerificationPurpose = 'REGISTER' | 'LOGIN';

export interface LoyaltyLevelRow {
  id: string;
  name: string;
  minSpent: number;
  cashbackPercent: number;
  discountPercent: number;
  sortOrder: number;
}

export interface UserRow {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  phone: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  bonusBalance: number;
  totalSpent: number;
  loyaltyLevelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithLoyaltyRow extends UserRow {
  loyaltyLevel: LoyaltyLevelRow | null;
}

export interface SessionRow {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  revokedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryRow {
  id: string;
  name: string;
  image: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IngredientRow {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  isAvailable: boolean;
  calories: number | null;
  proteins: number | null;
  fats: number | null;
  carbs: number | null;
  fiber: number | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductIngredientRow {
  id: string;
  productId: string;
  ingredientId: string;
  isDefault: boolean;
  isRemovable: boolean;
  isExtra: boolean;
}

export interface ProductIngredientWithIngredient extends ProductIngredientRow {
  ingredient: IngredientRow;
}

export interface ProductWithRelations extends ProductRow {
  category: CategoryRow;
  ingredients: ProductIngredientWithIngredient[];
}

export interface OrderRow {
  id: string;
  userId: string;
  status: OrderStatus;
  total: number;
  discountAmount: number;
  bonusUsed: number;
  bonusEarned: number;
  paymentStatus: PaymentStatus;
  paymentId: string | null;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderItemCustomizationRow {
  id: string;
  orderItemId: string;
  ingredientId: string;
  action: IngredientAction;
  priceDelta: number;
}

export interface BonusTransactionRow {
  id: string;
  userId: string;
  amount: number;
  type: BonusType;
  orderId: string | null;
  description: string | null;
  createdAt: Date;
}

export interface VerificationCodeRow {
  id: string;
  email: string;
  codeHash: string;
  purpose: VerificationPurpose;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}
