// Pure builders shared by the server and protocol tests. All money is kopecks.
import { createHash } from 'node:crypto';

// Tag 1192 is limited to 16 characters on the terminal. Keep a deterministic
// ASCII reference here; the human-readable order ID belongs in tag 1084.
export function receiptOrderReference(orderId: string): string {
  return 'B'+createHash('sha256').update(orderId).digest('base64url').slice(0,15);
}

export interface FiscalItem { productId: string; variantId?: string | null; name: string; quantity: number; unitPrice: number }
export interface FiscalOptions { taxSystemCode: number; taxRateId: number; calculationTypeId: number; calculationSubjectId: number; cashierName?: string }

export function receiptPositions(items: FiscalItem[], totalKopecks: number, options: FiscalOptions) {
  if (!items.length || !Number.isSafeInteger(totalKopecks) || totalKopecks < 0) throw new Error('Некорректная сумма чека');
  const weights = items.map(item => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !item.name) throw new Error('Некорректная позиция чека');
    return Math.round(item.unitPrice * 100) * item.quantity;
  });
  const subtotal = weights.reduce((a,b) => a+b,0);
  if (totalKopecks > subtotal || subtotal <= 0) throw new Error('Сумма чека не совпадает с заказом');
  const amounts = weights.map(weight => Math.floor(weight * totalKopecks / subtotal));
  const remaining = totalKopecks - amounts.reduce((a,b) => a+b,0);
  const ranked = weights.map((weight,i) => ({i, fraction: weight * totalKopecks / subtotal - amounts[i]})).sort((a,b) => b.fraction-a.fraction);
  for (let i=0;i<remaining;i++) amounts[ranked[i].i]++;
  // Split identical units into at most two price groups to keep quantity*price
  // exactly equal to the discounted order total, including a one-kopeck remainder.
  return items.flatMap((item,i) => {
    const price = Math.floor(amounts[i] / item.quantity);
    const extra = amounts[i] % item.quantity;
    return [{quantity:item.quantity-extra,price}, {quantity:extra,price:price+1}].filter(part => part.quantity > 0).map(part => ({
      externalId: `belok:${item.variantId || item.productId}`,
      info: { name:item.name.slice(0,128), baseQuantity:String(part.quantity), finalPrice:part.price,
        taxRateId:options.taxRateId, calculationTypeId:options.calculationTypeId,
        calculationSubjectId:options.calculationSubjectId, quantityUnitId:0, quantityUnitText:'шт.' },
    }));
  });
}

export function parsePurchaseResult(raw: string | null | undefined, amount: number): Record<string, unknown> {
  const result = JSON.parse(raw || 'null');
  if (!result || typeof result.id !== 'string' || !result.content || result.content.type !== 'purchase' ||
    result.content.amount !== amount || (result.content.responseCode != null && !['00','000'].includes(result.content.responseCode))) {
    throw new Error('Результат оплаты требует проверки');
  }
  return result;
}

export function parseReceiptResult(raw: string | null | undefined, payload: Record<string,unknown>): Record<string,unknown> {
  const result=JSON.parse(raw || 'null');
  const payments=payload.payments as {amount:number}[];
  const info=payload.info as {additionalAttribute:string};
  if(!result || typeof result.id!=='string' || result.isNonFiscal!==false || result.info?.typeId!==1 ||
    result.info?.sum!==payments.reduce((sum,p)=>sum+p.amount,0) || result.info?.additionalAttribute!==info.additionalAttribute) {
    throw new Error('Фискальный результат требует проверки');
  }
  return result;
}
