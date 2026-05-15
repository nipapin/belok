import type { UserWithLoyaltyRow } from './types';

export type UserWithLoyalty = UserWithLoyaltyRow;

/** Сериализация пользователя для клиента (API /me, профиль, вход). */
export function toClientUser(user: UserWithLoyalty) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    bonusBalance: user.bonusBalance,
    totalSpent: user.totalSpent,
    loyaltyLevel: user.loyaltyLevel,
  };
}
