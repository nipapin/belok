// Apple Wallet pass generation and Google Wallet link generation utilities.
// 
// Apple Wallet requires:
// - An Apple Developer account with Pass Type ID certificate
// - .p12 certificate file and WWDR certificate
// - passkit-generator npm package
//
// Google Wallet requires:
// - Google Cloud project with Wallet API enabled
// - Service account JSON key
//
// This file provides helpers that work in both development (mock) and production modes.

import { brandMark } from '@/lib/brand';

export interface WalletCardData {
  userId: string;
  userName: string;
  phone: string;
  loyaltyLevel: string;
  bonusBalance: number;
  totalSpent: number;
  barcode: string;
}

// Google Wallet JWT-based pass link
export function generateGoogleWalletLink(data: WalletCardData): string {
  const passObject = {
    iss: process.env.GOOGLE_WALLET_ISSUER_EMAIL || 'wallet@belok.cafe',
    aud: 'google',
    typ: 'savetowallet',
    origins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'],
    payload: {
      loyaltyObjects: [
        {
          id: `belok-loyalty-${data.userId}`,
          classId: `${process.env.GOOGLE_WALLET_ISSUER_ID || 'belok'}.belok-loyalty`,
          state: 'ACTIVE',
          accountId: data.phone,
          accountName: data.userName || data.phone,
          loyaltyPoints: {
            label: 'Бонусы',
            balance: {
              int: Math.floor(data.bonusBalance),
            },
          },
          barcode: {
            type: 'QR_CODE',
            value: data.barcode,
          },
        },
      ],
    },
  };

  const encoded = Buffer.from(JSON.stringify(passObject)).toString('base64url');
  return `https://pay.google.com/gp/v/save/${encoded}`;
}

// Apple Wallet .pkpass generation (returns Buffer)
// In production, use passkit-generator with real certificates.
// This returns a structured pass.json that can be used with the passkit-generator lib.
export function generateApplePassJson(data: WalletCardData) {
  return {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.cafe.belok.loyalty',
    serialNumber: `belok-${data.userId}`,
    teamIdentifier: process.env.APPLE_TEAM_ID || 'XXXXXXXXXX',
    organizationName: brandMark,
    description: `Карта лояльности ${brandMark}`,
    logoText: brandMark,
    foregroundColor: 'rgb(26, 26, 26)',
    backgroundColor: 'rgb(255, 255, 255)',
    labelColor: 'rgb(107, 107, 107)',
    generic: {
      primaryFields: [
        {
          key: 'balance',
          label: 'Бонусы',
          value: Math.floor(data.bonusBalance),
        },
      ],
      secondaryFields: [
        {
          key: 'level',
          label: 'Уровень',
          value: data.loyaltyLevel,
        },
        {
          key: 'spent',
          label: 'Потрачено',
          value: `${data.totalSpent} ₽`,
        },
      ],
      auxiliaryFields: [
        {
          key: 'name',
          label: 'Имя',
          value: data.userName || 'Гость',
        },
      ],
      backFields: [
        {
          key: 'phone',
          label: 'Телефон',
          value: data.phone,
        },
        {
          key: 'rules',
          label: 'Правила программы',
          value: 'Бонусами можно оплатить до 30% заказа. 1 бонус = 1 рубль.',
        },
      ],
    },
    barcode: {
      message: data.barcode,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
    },
  };
}
