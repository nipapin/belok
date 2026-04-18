import type { LoyaltyLevel, User } from '@prisma/client';

export type UserWithLoyalty = User & { loyaltyLevel: LoyaltyLevel | null };

/** Сериализация пользователя для клиента (API /me, профиль, вход). */
export function toClientUser(user: UserWithLoyalty) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    bonusBalance: user.bonusBalance,
    totalSpent: user.totalSpent,
    loyaltyLevel: user.loyaltyLevel,
  };
}
