import type { IngredientAction, OrderFulfillment, OrderPaymentMethod, OrderSource, OrderStatus, PaymentStatus } from '@/lib/types';

export interface BoardOrder {
  id: string;
  dailyNumber: number | null;
  status: OrderStatus;
  source: OrderSource;
  fulfillment: OrderFulfillment;
  paymentMethod: OrderPaymentMethod | null;
  paymentStatus: PaymentStatus;
  total: number;
  comment: string | null;
  deliveryAddress: string | null;
  deliveryTime: string | null;
  createdAt: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    customizations: { id: string; action: IngredientAction; name: string }[];
  }[];
}
