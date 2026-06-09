import dayjs from 'dayjs';
import { UnitType, UnitConversionRate, NutritionFacts, DesensitizeOptions, UserProfile, FoodItem } from '../types';

const WEIGHT_UNITS = new Set([
  UnitType.GRAM,
  UnitType.KILOGRAM,
  UnitType.POUND,
  UnitType.OUNCE
]);

const VOLUME_UNITS = new Set([
  UnitType.MILLILITER,
  UnitType.LITER,
  UnitType.CUP,
  UnitType.TABLESPOON,
  UnitType.TEASPOON
]);

export const isWeightUnit = (unit: UnitType): boolean => WEIGHT_UNITS.has(unit);
export const isVolumeUnit = (unit: UnitType): boolean => VOLUME_UNITS.has(unit);

export const normalizeWeightToGrams = (value: number, unit: UnitType): number => {
  if (!isWeightUnit(unit)) {
    return value;
  }
  try {
    return convertUnit(value, unit, UnitType.GRAM);
  } catch {
    return value;
  }
};

export const normalizeWeightToKg = (value: number, unit: UnitType): number => {
  if (!isWeightUnit(unit)) {
    return value;
  }
  try {
    return convertUnit(value, unit, UnitType.KILOGRAM);
  } catch {
    return value;
  }
};

export const normalizeVolumeToMl = (value: number, unit: UnitType): number => {
  if (!isVolumeUnit(unit)) {
    return value;
  }
  try {
    return convertUnit(value, unit, UnitType.MILLILITER);
  } catch {
    return value;
  }
};

export const calculateCupsFromMl = (ml: number, cupSize: number = 240): number => {
  return roundTo(ml / cupSize, 1);
};

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
  { from: UnitType.POUND, to: UnitType.GRAM, rate: 453.592 },
  { from: UnitType.GRAM, to: UnitType.POUND, rate: 0.00220462 },
  { from: UnitType.KILOGRAM, to: UnitType.OUNCE, rate: 35.274 },
  { from: UnitType.OUNCE, to: UnitType.KILOGRAM, rate: 0.0283495 },
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

export const normalizeTo100gNutrition = (
  nutrition: NutritionFacts,
  servingSize: number,
  servingUnit: UnitType
): NutritionFacts => {
  let grams = servingSize;
  if (servingUnit === UnitType.KILOGRAM) {
    grams = servingSize * 1000;
  } else if (servingUnit === UnitType.POUND) {
    grams = servingSize * 453.592;
  } else if (servingUnit === UnitType.OUNCE) {
    grams = servingSize * 28.3495;
  } else if (servingUnit === UnitType.CUP) {
    grams = servingSize * 240;
  }

  return calculateNutritionForQuantity(nutrition, grams, 100);
};

export const calculateFoodNutrition = (
  food: FoodItem,
  quantity: number,
  unit: UnitType,
  options?: {
    isCooked?: boolean;
    useEdiblePortion?: boolean;
    customRates?: UnitConversionRate[];
  }
): {
  nutrition: NutritionFacts;
  normalizedQuantityGrams: number;
  conversionDetails: {
    used100gBase: boolean;
    appliedCookingConversion: boolean;
    appliedEdiblePortion: boolean;
    ediblePortionUsed?: number;
  };
} => {
  const { isCooked = false, useEdiblePortion = true, customRates = [] } = options || {};
  let targetGrams: number;
  let baseNutrition: NutritionFacts;
  let baseGrams = 100;
  let used100gBase = false;
  let appliedCookingConversion = false;
  let appliedEdiblePortion = false;
  let ediblePortionUsed: number | undefined;

  if (unit === UnitType.GRAM) {
    targetGrams = quantity;
  } else if (unit === UnitType.KILOGRAM) {
    targetGrams = quantity * 1000;
  } else if (unit === UnitType.POUND) {
    targetGrams = quantity * 453.592;
  } else if (unit === UnitType.OUNCE) {
    targetGrams = quantity * 28.3495;
  } else if (unit === UnitType.CUP) {
    if (food.conversionInfo?.cupInfo) {
      targetGrams = quantity * food.conversionInfo.cupInfo.grams;
    } else {
      targetGrams = quantity * 240;
    }
  } else if (unit === UnitType.PIECE && food.conversionInfo?.servingInfo) {
    targetGrams = quantity * food.conversionInfo.servingInfo.grams;
  } else {
    try {
      targetGrams = convertUnit(quantity, unit, UnitType.GRAM, customRates);
    } catch {
      targetGrams = quantity;
    }
  }

  if (food.conversionInfo) {
    baseNutrition = food.conversionInfo.nutritionPer100g;
    baseGrams = 100;
    used100gBase = true;

    if (isCooked && food.conversionInfo.cookingConversion) {
      targetGrams = targetGrams / food.conversionInfo.cookingConversion.rawToCookedRatio;
      appliedCookingConversion = true;
    }

    if (useEdiblePortion && food.conversionInfo.ediblePortion > 0 && food.conversionInfo.ediblePortion <= 100) {
      const ediblePortionRatio = food.conversionInfo.ediblePortion / 100;
      targetGrams = targetGrams * ediblePortionRatio;
      appliedEdiblePortion = true;
      ediblePortionUsed = food.conversionInfo.ediblePortion;
    }
  } else {
    baseNutrition = food.nutritionFacts;
    if (food.servingUnit === UnitType.GRAM) {
      baseGrams = food.servingSize;
    } else if (food.servingUnit === UnitType.KILOGRAM) {
      baseGrams = food.servingSize * 1000;
    } else if (food.servingUnit === UnitType.POUND) {
      baseGrams = food.servingSize * 453.592;
    } else if (food.servingUnit === UnitType.OUNCE) {
      baseGrams = food.servingSize * 28.3495;
    } else if (food.servingUnit === UnitType.CUP) {
      const cupInfo = (food as any).cupInfo;
      if (cupInfo && cupInfo.gramsPerCup) {
        baseGrams = food.servingSize * cupInfo.gramsPerCup;
      } else {
        baseGrams = food.servingSize * 240;
      }
    } else {
      baseGrams = food.servingSize;
    }
  }

  const nutrition = calculateNutritionForQuantity(baseNutrition, baseGrams, targetGrams);

  if (food.conversionInfo?.cookingConversion && isCooked && appliedCookingConversion) {
    const retentionRate = food.conversionInfo.cookingConversion.nutritionRetentionRate;
    Object.keys(nutrition).forEach(key => {
      const k = key as keyof NutritionFacts;
      if (nutrition[k] !== undefined && typeof nutrition[k] === 'number') {
        (nutrition[k] as number) = roundTo((nutrition[k] as number) * retentionRate, 2);
      }
    });
  }

  return {
    nutrition,
    normalizedQuantityGrams: roundTo(targetGrams, 2),
    conversionDetails: {
      used100gBase,
      appliedCookingConversion,
      appliedEdiblePortion,
      ediblePortionUsed,
    },
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

const maskWeightForPrivacy = (weight: number): string => {
  const bmiCategories = [
    { max: 40, label: '极轻体重' },
    { max: 50, label: '较轻体重' },
    { max: 60, label: '标准偏轻' },
    { max: 70, label: '标准体重' },
    { max: 80, label: '标准偏重' },
    { max: 90, label: '较重体重' },
    { max: 100, label: '肥胖' },
    { max: Infinity, label: '严重肥胖' },
  ];
  const category = bmiCategories.find(c => weight < c.max);
  return category?.label || '体重范围保密';
};

const maskHeightForPrivacy = (height: number): string => {
  if (height < 150) return '较矮身高';
  if (height < 160) return '中等偏矮';
  if (height < 170) return '中等身高';
  if (height < 180) return '中等偏高';
  if (height < 190) return '较高身高';
  return '身高范围保密';
};

const maskAgeForPrivacy = (birthDate: number): string => {
  const age = Math.floor((Date.now() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
  if (age < 18) return '未成年人';
  if (age < 25) return '青年早期';
  if (age < 35) return '青年';
  if (age < 45) return '中青年';
  if (age < 55) return '中年';
  if (age < 65) return '中老年';
  return '老年';
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
    (result as any).weightRange = maskWeightForPrivacy(profile.weight);
    delete result.weight;
    delete result.weightUnit;
  }

  if (options.maskHeight && profile.height !== undefined) {
    (result as any).heightRange = maskHeightForPrivacy(profile.height);
    delete result.height;
    delete result.heightUnit;
  }

  if (options.maskBirthDate && profile.birthDate !== undefined) {
    (result as any).ageGroup = maskAgeForPrivacy(profile.birthDate);
    delete result.birthDate;
  }

  if (options.maskAllergies) {
    (result as any).allergyCount = profile.allergies?.length || 0;
    delete result.allergies;
  }

  if (options.maskMedicalInfo) {
    (result as any).hasMedicalConditions = (profile.medicalConditions?.length || 0) > 0;
    (result as any).medicationCount = profile.medications?.length || 0;
    delete result.medicalConditions;
    delete result.medications;
  }

  return result;
};

export const desensitizeWeightRecord = (
  record: any,
  options: DesensitizeOptions = {}
): any => {
  const result = { ...record };
  
  if (options.maskWeight) {
    (result as any).weightRange = maskWeightForPrivacy(record.normalizedWeightKg || record.weight);
    delete result.weight;
    delete result.unit;
    delete result.normalizedWeightKg;
    delete result.bodyFat;
    delete result.muscleMass;
    delete result.waterWeight;
    delete result.boneMass;
  }
  
  return result;
};

const maskWeightValues = (text: string): string => {
  return text
    .replace(/[+-]?\s*[\d.]+\s*(kg|千克|公斤|斤|磅|lb)/g, 'XX$1')
    .replace(/体重(增加|减少|变化)[\d.]+/g, '体重$1XX')
    .replace(/(增重|减重)[\d.]+/g, '$1XX');
};

export const desensitizeReport = (
  report: any,
  options: DesensitizeOptions = {}
): any => {
  if (!report) return report;
  
  const result = { ...report };
  
  if (options.maskUserId !== false) {
    result.userId = maskString(report.userId);
  }
  
  if (options.maskWeight) {
    result.weightTrend = report.weightTrend.map((w: number) => 
      w > 0 ? Math.round(w) : 0
    );
    result.weightChange = Math.round(result.weightChange);
    
    if (result.abnormalFluctuations) {
      result.abnormalFluctuations = report.abnormalFluctuations.map((f: any) => ({
        ...f,
        weightChange: Math.round(f.weightChange),
        description: maskWeightValues(f.description),
      }));
    }
    
    if (result.weeklySummary) {
      result.weeklySummary = maskWeightValues(result.weeklySummary);
    }
    
    if (result.summary) {
      result.summary = maskWeightValues(result.summary);
    }
    
    if (result.suggestions) {
      result.suggestions = result.suggestions.map((s: string) => maskWeightValues(s));
    }
    
    if (result.weightComparison) {
      result.weightComparison = maskWeightValues(result.weightComparison);
    }
  }
  
  return result;
};

export const desensitizeWeeklyReport = desensitizeReport;

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
