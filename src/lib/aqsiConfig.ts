import 'server-only';
import { getAppSetting } from '@/lib/appSettings';

export interface AqsiConfig {
  enabled: boolean; deviceId: number; receiptsEnabled: boolean; catalogEnabled: boolean; cashOrdersEnabled:boolean;
  taxSystemCode: number; taxRateId: number | null; calculationTypeId: number | null;
  calculationSubjectId: number; cashierName: string;
}

export async function getAqsiConfig(): Promise<AqsiConfig> {
  const stored = await getAppSetting<Partial<AqsiConfig>>('aqsi');
  return {
    enabled: false, deviceId: Number(process.env.AQSI_DEVICE_ID) || 0,
    receiptsEnabled: false, catalogEnabled: false, cashOrdersEnabled:true,
    taxSystemCode: 2, taxRateId: null, calculationTypeId: null,
    calculationSubjectId: 1, cashierName: '', ...stored,
  };
}

export function aqsiConfigured(config: AqsiConfig): boolean {
  return config.enabled && Number.isInteger(config.deviceId) && config.deviceId > 0 && Boolean(process.env.AQSI_API_KEY?.trim());
}

export function fiscalConfigured(config: AqsiConfig): boolean {
  return [1,2,4,16,32].includes(config.taxSystemCode) && config.taxRateId != null &&
    Number.isInteger(config.taxRateId) && config.taxRateId >= 1 && config.taxRateId <= 10 &&
    config.calculationTypeId === 4 && config.calculationSubjectId === 1;
}
