import dayjs from 'dayjs';
import { UnitType, UnitConversionRate, NutritionFacts, DesensitizeOptions, UserProfile } from '../types';

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const getTimestamp = (): number => {
  return Date.now();
};

export const formatDate = (timestamp: number, format: string = 'YYYY-MM-DD'): string => {
  return dayjs(timestamp).format(format);
};

export const isSameDay = (ts1: number, ts2: number): boolean => {
  return dayjs(ts1).isSame(dayjs(ts2), 'day');
};

export const getStartOfDay = (timestamp: number): number => {
  return dayjs(timestamp).startOf('day').valueOf();
};

export const getEndOfDay = (timestamp: number): number => {
  return dayjs(timestamp).endOf('day').valueOf();
};

export const getDaysDiff = (ts1: number, ts2: number): number => {
  return Math.abs(dayjs(ts1).diff(dayjs(ts2), 'day'));
};

const unitConversionRates: UnitConversionRate[] = [
  { from: UnitType.KILOGRAM, to: UnitType.GRAM, rate: 1000 },
  { from: UnitType.GRAM, to: UnitType.KILOGRAM, rate: 0.001 },
  { from: UnitType.KILOGRAM, to: UnitType.POUND, rate: 2.20462 },
  { from: UnitType.POUND, to: UnitType.KILOGRAM, rate: 0.453592 },
  { from: UnitType.POUND, to: UnitType.OUNCE, rate: 16 },
  { from: UnitType.OUNCE, to: UnitType.POUND, rate: 0.0625 },
  { from: UnitType.GRAM, to: UnitType.OUNCE, rate: 0.035274 },
  { from: UnitType.OUNCE, to: UnitType.GRAM, rate: 28.3495 },
  { from: UnitType.LITER, to: UnitType.MILLILITER, rate: 1000 },
  { from: UnitType.MILLILITER, to: UnitType.LITER, rate: 0.001 },
  { from: UnitType.CUP, to: UnitType.MILLILITER, rate: 240 },
  { from: UnitType.MILLILITER, to: UnitType.CUP, rate: 1 / 240 },
  { from: UnitType.TABLESPOON, to: UnitType.MILLILITER, rate: 15 },
  { from: UnitType.MILLILITER, to: UnitType.TABLESPOON, rate: 1 / 15 },
  { from: UnitType.TEASPOON, to: UnitType.MILLILITER, rate: 5 },
  { from: UnitType.MILLILITER, to: UnitType.TEASPOON, rate: 1 / 5 },
  { from: UnitType.CUP, to: UnitType.TABLESPOON, rate: 16 },
  { from: UnitType.TABLESPOON, to: UnitType.CUP, rate: 1 / 16 },
  { from: UnitType.TABLESPOON, to: UnitType.TEASPOON, rate: 3 },
  { from: UnitType.TEASPOON, to: UnitType.TABLESPOON, rate: 1 / 3 },
  { from: UnitType.METER, to: UnitType.CENTIMETER, rate: 100 },
  { from: UnitType.CENTIMETER, to: UnitType.METER, rate: 0.01 },
  { from: UnitType.INCH, to: UnitType.CENTIMETER, rate: 2.54 },
  { from: UnitType.CENTIMETER, to: UnitType.INCH, rate: 1 / 2.54 },
  { from: UnitType.METER, to: UnitType.INCH, rate: 39.3701 },
  { from: UnitType.INCH, to: UnitType.METER, rate: 0.0254 },
];

export const convertUnit = (
  value: number,
  fromUnit: UnitType,
  toUnit: UnitType,
  customRates?: UnitConversionRate[]
): number => {
  if (fromUnit === toUnit) return value;

  const allRates = [...unitConversionRates, ...(customRates || [])];
  const directRate = allRates.find(r => r.from === fromUnit && r.to === toUnit);

  if (directRate) {
    return value * directRate.rate;
  }

  const viaGram = allRates.find(r => r.from === fromUnit && r.to === UnitType.GRAM);
  const fromGram = allRates.find(r => r.from === UnitType.GRAM && r.to === toUnit);

  if (viaGram && fromGram) {
    return value * viaGram.rate * fromGram.rate;
  }

  const viaMl = allRates.find(r => r.from === fromUnit && r.to === UnitType.MILLILITER);
  const fromMl = allRates.find(r => r.from === UnitType.MILLILITER && r.to === toUnit);

  if (viaMl && fromMl) {
    return value * viaMl.rate * fromMl.rate;
  }

  throw new Error(`Cannot convert from ${fromUnit} to ${toUnit}`);
};

export const calculateNutritionForQuantity = (
  baseNutrition: NutritionFacts,
  baseQuantity: number,
  targetQuantity: number
): NutritionFacts => {
  const multiplier = targetQuantity / baseQuantity;

  return {
    calories: baseNutrition.calories * multiplier,
    protein: baseNutrition.protein * multiplier,
    carbs: baseNutrition.carbs * multiplier,
    fat: baseNutrition.fat * multiplier,
    ...(baseNutrition.fiber !== undefined && { fiber: baseNutrition.fiber * multiplier }),
    ...(baseNutrition.sugar !== undefined && { sugar: baseNutrition.sugar * multiplier }),
    ...(baseNutrition.sodium !== undefined && { sodium: baseNutrition.sodium * multiplier }),
    ...(baseNutrition.cholesterol !== undefined && { cholesterol: baseNutrition.cholesterol * multiplier }),
    ...(baseNutrition.saturatedFat !== undefined && { saturatedFat: baseNutrition.saturatedFat * multiplier }),
    ...(baseNutrition.transFat !== undefined && { transFat: baseNutrition.transFat * multiplier }),
    ...(baseNutrition.vitaminA !== undefined && { vitaminA: baseNutrition.vitaminA * multiplier }),
    ...(baseNutrition.vitaminC !== undefined && { vitaminC: baseNutrition.vitaminC * multiplier }),
    ...(baseNutrition.calcium !== undefined && { calcium: baseNutrition.calcium * multiplier }),
    ...(baseNutrition.iron !== undefined && { iron: baseNutrition.iron * multiplier }),
  };
};

export const sumNutrition = (nutritions: NutritionFacts[]): NutritionFacts => {
  return nutritions.reduce((acc, curr) => ({
    calories: acc.calories + curr.calories,
    protein: acc.protein + curr.protein,
    carbs: acc.carbs + curr.carbs,
    fat: acc.fat + curr.fat,
    fiber: (acc.fiber || 0) + (curr.fiber || 0) || undefined,
    sugar: (acc.sugar || 0) + (curr.sugar || 0) || undefined,
    sodium: (acc.sodium || 0) + (curr.sodium || 0) || undefined,
    cholesterol: (acc.cholesterol || 0) + (curr.cholesterol || 0) || undefined,
    saturatedFat: (acc.saturatedFat || 0) + (curr.saturatedFat || 0) || undefined,
    transFat: (acc.transFat || 0) + (curr.transFat || 0) || undefined,
    vitaminA: (acc.vitaminA || 0) + (curr.vitaminA || 0) || undefined,
    vitaminC: (acc.vitaminC || 0) + (curr.vitaminC || 0) || undefined,
    calcium: (acc.calcium || 0) + (curr.calcium || 0) || undefined,
    iron: (acc.iron || 0) + (curr.iron || 0) || undefined,
  }), { 
    calories: 0, 
    protein: 0, 
    carbs: 0, 
    fat: 0,
    fiber: undefined,
    sugar: undefined,
    sodium: undefined,
    cholesterol: undefined,
    saturatedFat: undefined,
    transFat: undefined,
    vitaminA: undefined,
    vitaminC: undefined,
    calcium: undefined,
    iron: undefined
  });
};

export const averageNutrition = (nutritions: NutritionFacts[]): NutritionFacts => {
  if (nutritions.length === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }

  const sum = sumNutrition(nutritions);
  const count = nutritions.length;

  return {
    calories: sum.calories / count,
    protein: sum.protein / count,
    carbs: sum.carbs / count,
    fat: sum.fat / count,
    ...(sum.fiber !== undefined && { fiber: sum.fiber / count }),
    ...(sum.sugar !== undefined && { sugar: sum.sugar / count }),
    ...(sum.sodium !== undefined && { sodium: sum.sodium / count }),
    ...(sum.cholesterol !== undefined && { cholesterol: sum.cholesterol / count }),
    ...(sum.saturatedFat !== undefined && { saturatedFat: sum.saturatedFat / count }),
    ...(sum.transFat !== undefined && { transFat: sum.transFat / count }),
    ...(sum.vitaminA !== undefined && { vitaminA: sum.vitaminA / count }),
    ...(sum.vitaminC !== undefined && { vitaminC: sum.vitaminC / count }),
    ...(sum.calcium !== undefined && { calcium: sum.calcium / count }),
    ...(sum.iron !== undefined && { iron: sum.iron / count }),
  };
};

const maskString = (str: string, visibleStart: number = 1, visibleEnd: number = 1): string => {
  if (str.length <= visibleStart + visibleEnd) {
    return '*'.repeat(str.length);
  }
  return str.substr(0, visibleStart) + '*'.repeat(str.length - visibleStart - visibleEnd) + str.substr(-visibleEnd);
};

const maskNumber = (num: number, precision: number = 1): number => {
  return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
};

export const desensitizeUserProfile = (
  profile: UserProfile,
  options: DesensitizeOptions = {}
): Partial<UserProfile> => {
  const result: Partial<UserProfile> = { ...profile };

  if (options.maskUserId !== false) {
    result.userId = maskString(profile.userId);
  }

  if (options.maskWeight && profile.weight !== undefined) {
    result.weight = maskNumber(profile.weight, 0);
  }

  if (options.maskHeight && profile.height !== undefined) {
    result.height = maskNumber(profile.height, 0);
  }

  if (options.maskBirthDate && profile.birthDate !== undefined) {
    const year = new Date(profile.birthDate).getFullYear();
    result.birthDate = new Date(year, 0, 1).getTime();
  }

  if (options.maskAllergies) {
    result.allergies = profile.allergies?.map(() => '***' as any);
  }

  if (options.maskMedicalInfo) {
    result.medicalConditions = profile.medicalConditions?.map(() => '***');
    result.medications = profile.medications?.map(() => '***');
  }

  return result;
};

export const roundTo = (value: number, decimals: number = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const calculateBMI = (weight: number, height: number, weightUnit: UnitType = UnitType.KILOGRAM, heightUnit: UnitType = UnitType.CENTIMETER): number => {
  let weightKg = weight;
  let heightM = height;

  if (weightUnit === UnitType.POUND) {
    weightKg = convertUnit(weight, UnitType.POUND, UnitType.KILOGRAM);
  }

  if (heightUnit === UnitType.CENTIMETER) {
    heightM = height / 100;
  } else if (heightUnit === UnitType.INCH) {
    heightM = convertUnit(height, UnitType.INCH, UnitType.CENTIMETER) / 100;
  }

  if (heightM === 0) return 0;

  return roundTo(weightKg / (heightM * heightM), 1);
};

export const getBMIStatus = (bmi: number): string => {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 24) return 'normal';
  if (bmi < 28) return 'overweight';
  return 'obese';
};

export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => any>(fn: T, limit: number): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const groupBy = <T, K extends keyof any>(array: T[], key: (item: T) => K): Record<K, T[]> => {
  return array.reduce((acc, item) => {
    const groupKey = key(item);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<K, T[]>);
};
