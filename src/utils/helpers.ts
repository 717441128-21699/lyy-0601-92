import dayjs from 'dayjs';
import { 
  UnitType, 
  UnitConversionRate, 
  NutritionFacts, 
  DesensitizeOptions, 
  UserProfile, 
  FoodItem,
  ValidationResult,
  ValidationError,
  ValidationErrorCode,
  DataQualityConfig,
  BatchOperationResult,
  WeightTrendDescription,
  DesensitizedWeightInfo,
} from '../types';

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
    const cupInfo = food.conversionInfo?.cupInfo;
    const legacyCupInfo = (food as any).cupInfo;
    
    if (cupInfo && cupInfo.grams) {
      targetGrams = quantity * cupInfo.grams;
    } else if (legacyCupInfo && legacyCupInfo.gramsPerCup) {
      targetGrams = quantity * legacyCupInfo.gramsPerCup;
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

    const ediblePortion = food.conversionInfo.ediblePortion;
    if (useEdiblePortion && ediblePortion !== undefined && ediblePortion > 0 && ediblePortion <= 100) {
      const ediblePortionRatio = ediblePortion / 100;
      targetGrams = targetGrams * ediblePortionRatio;
      appliedEdiblePortion = true;
      ediblePortionUsed = ediblePortion;
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

const maskString = (str: string | undefined | null, visibleStart: number = 1, visibleEnd: number = 1): string => {
  if (!str || typeof str !== 'string') {
    return '***';
  }
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
    const goalDirection = (report as any).goalDirection || 'stable';
    const startWeight = report.weeklyComparison?.previousWeek?.averageWeight || report.startWeight || 70;
    const endWeight = report.weeklyComparison?.currentWeek?.averageWeight || report.endWeight || 70;
    const weightChange = endWeight - startWeight;
    const days = report.period?.days || 14;
    
    const desensitizedWeight = createDesensitizedWeightInfo(
      weightChange,
      startWeight,
      endWeight,
      days,
      goalDirection
    );
    
    result.desensitizedWeightInfo = desensitizedWeight;
    
    const weightChangeObj = {
      description: desensitizedWeight.description,
      direction: desensitizedWeight.direction,
      changeCategory: desensitizedWeight.changeCategory,
    };
    
    if (result.weightTrend !== undefined) {
      result.weightTrend = {
        description: desensitizedWeight.description,
        direction: desensitizedWeight.direction,
        trend: desensitizedWeight.trend,
        changeCategory: desensitizedWeight.changeCategory,
      };
    }
    
    if (result.weightChange !== undefined) {
      result.weightChange = weightChangeObj;
    }
    
    if (result.weeklyComparison) {
      result.weeklyComparison = {
        ...result.weeklyComparison,
        currentWeek: {
          ...result.weeklyComparison.currentWeek,
          averageWeight: {
            description: `本期平均体重${desensitizedWeight.direction === 'up' ? '略有上升' : desensitizedWeight.direction === 'down' ? '略有下降' : '基本稳定'}`,
            direction: desensitizedWeight.direction,
          },
        },
        previousWeek: {
          ...result.weeklyComparison.previousWeek,
          averageWeight: {
            description: '上期平均体重',
            direction: 'stable' as const,
          },
        },
      };
    }
    
    if (result.abnormalFluctuations) {
      result.abnormalFluctuations = report.abnormalFluctuations.map((f: any) => ({
        ...f,
        weightChange: {
          description: '体重有异常波动',
          direction: f.weightChange > 0 ? 'up' : f.weightChange < 0 ? 'down' : 'stable',
        },
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
    
    if (result.weightAnalysis) {
      result.weightAnalysis = {
        ...result.weightAnalysis,
        startWeight: null,
        endWeight: null,
        weightChange: null,
        changePercent: null,
        weeklyRate: null,
        desensitizedInfo: desensitizedWeight,
      };
    }
    
    if (result.healthScore) {
      result.healthScore = {
        ...result.healthScore,
        weight: desensitizedWeight.direction === 'stable' ? 0 : null,
      };
    }
    
    if (result.avgWeight) {
      result.avgWeight = {
        description: `平均体重${desensitizedWeight.direction === 'up' ? '略有上升' : desensitizedWeight.direction === 'down' ? '略有下降' : '基本稳定'}`,
        direction: desensitizedWeight.direction,
      };
    }
  }
  
  return result;
};

export const desensitizeWeeklyReport = desensitizeReport;
export const desensitizeMonthlyReport = desensitizeReport;
export const desensitizeTrendAnalysis = desensitizeReport;

export const roundTo = (value: number, decimals: number = 2): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const safeDivide = (numerator: number, denominator: number, defaultValue: number = 0): number => {
  if (denominator === 0 || !isFinite(denominator) || !isFinite(numerator)) {
    return defaultValue;
  }
  return numerator / denominator;
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

export const DEFAULT_DATA_QUALITY_CONFIG: DataQualityConfig = {
  enableValidation: true,
  rejectOnError: false,
  autoCorrectWarnings: true,
  maxFutureDays: 1,
  maxPastDays: 365,
  minQuantity: 0.1,
  maxQuantity: 10000,
  nutritionRanges: {
    calories: { min: 0, max: 900, per100g: true },
    protein: { min: 0, max: 100, per100g: true },
    carbs: { min: 0, max: 100, per100g: true },
    fat: { min: 0, max: 100, per100g: true },
  },
};

const createValidationError = (
  code: ValidationErrorCode,
  field: string,
  message: string,
  suggestion: string,
  currentValue: any,
  severity: 'error' | 'warning' | 'info' = 'error',
  expectedRange?: { min?: number; max?: number },
  suggestedValue?: any
): ValidationError => ({
  code,
  severity,
  field,
  message,
  suggestion,
  currentValue,
  expectedRange,
  suggestedValue,
});

export const validateUnit = (unit: UnitType, allowedUnits: UnitType[], field: string = 'unit'): ValidationError | null => {
  if (!allowedUnits.includes(unit)) {
    return createValidationError(
      'INVALID_UNIT',
      field,
      `单位 ${unit} 不支持`,
      `请使用以下单位之一: ${allowedUnits.join(', ')}`,
      unit
    );
  }
  return null;
};

export const validateQuantity = (
  quantity: number,
  field: string = 'quantity',
  config: Partial<DataQualityConfig> = {}
): ValidationError | null => {
  const min = config.minQuantity ?? DEFAULT_DATA_QUALITY_CONFIG.minQuantity;
  const max = config.maxQuantity ?? DEFAULT_DATA_QUALITY_CONFIG.maxQuantity;

  if (typeof quantity !== 'number' || isNaN(quantity)) {
    return createValidationError(
      'INVALID_QUANTITY',
      field,
      '数量必须是有效数字',
      '请输入有效的数字',
      quantity
    );
  }

  if (quantity <= 0) {
    return createValidationError(
      'INVALID_QUANTITY',
      field,
      '数量必须大于0',
      `请输入大于0的数值，建议不小于 ${min}`,
      quantity,
      'error',
      { min },
      min
    );
  }

  if (quantity < min) {
    return createValidationError(
      'INVALID_QUANTITY',
      field,
      `数量 ${quantity} 过小`,
      `建议数量不小于 ${min}`,
      quantity,
      'warning',
      { min },
      min
    );
  }

  if (quantity > max) {
    return createValidationError(
      'INVALID_QUANTITY',
      field,
      `数量 ${quantity} 过大`,
      `建议数量不大于 ${max}`,
      quantity,
      'error',
      { max },
      max
    );
  }

  return null;
};

export const validateTimestamp = (
  timestamp: number,
  field: string = 'timestamp',
  config: Partial<DataQualityConfig> = {}
): ValidationError | null => {
  const now = Date.now();
  const maxFutureDays = config.maxFutureDays ?? DEFAULT_DATA_QUALITY_CONFIG.maxFutureDays;
  const maxPastDays = config.maxPastDays ?? DEFAULT_DATA_QUALITY_CONFIG.maxPastDays;

  if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) {
    return createValidationError(
      'INVALID_TIMESTAMP',
      field,
      '时间戳必须是有效数字',
      '请输入有效的时间戳',
      timestamp
    );
  }

  const maxFutureTime = now + maxFutureDays * 24 * 60 * 60 * 1000;
  if (timestamp > maxFutureTime) {
    return createValidationError(
      'INVALID_TIMESTAMP',
      field,
      '时间戳不能超过未来太久',
      `请选择不超过 ${maxFutureDays} 天内的时间`,
      timestamp,
      'error',
      { max: maxFutureTime }
    );
  }

  const minPastTime = now - maxPastDays * 24 * 60 * 60 * 1000;
  if (timestamp < minPastTime) {
    return createValidationError(
      'INVALID_TIMESTAMP',
      field,
      '时间戳太久远',
      `请选择不超过 ${maxPastDays} 天内的时间`,
      timestamp,
      'error',
      { min: minPastTime }
    );
  }

  return null;
};

export const validateNutritionValues = (
  nutrition: Partial<NutritionFacts>,
  field: string = 'nutritionFacts',
  config: Partial<DataQualityConfig> = {}
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const ranges = config.nutritionRanges ?? DEFAULT_DATA_QUALITY_CONFIG.nutritionRanges;

  for (const [key, value] of Object.entries(nutrition)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(createValidationError(
        'INVALID_NUTRITION_VALUE',
        `${field}.${key}`,
        `${key} 必须是有效数字`,
        '请输入有效的数字',
        value
      ));
      continue;
    }
    if (value < 0) {
      errors.push(createValidationError(
        'INVALID_NUTRITION_VALUE',
        `${field}.${key}`,
        `${key} 不能为负数`,
        '请输入非负数',
        value,
        'error',
        { min: 0 }
      ));
      continue;
    }
    const range = ranges[key as keyof NutritionFacts];
    if (range && value > range.max) {
      errors.push(createValidationError(
        'NUTRITION_IMBALANCED',
        `${field}.${key}`,
        `${key} ${value} 超出正常范围`,
        `建议 ${key} 不超过 ${range.max}${range.per100g ? ' (每100g)' : ''}`,
        value,
        'warning',
        { max: range.max }
      ));
    }
  }

  return errors;
};

export const validateMealFoodEntry = (
  food: FoodItem,
  quantity: number,
  unit: UnitType,
  config: Partial<DataQualityConfig> = {}
): ValidationResult<{ food: FoodItem; quantity: number; unit: UnitType; isCooked?: boolean }> => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const unitError = validateUnit(unit, Object.values(UnitType), 'unit');
  if (unitError) errors.push(unitError);

  const quantityError = validateQuantity(quantity, 'quantity', config);
  if (quantityError) {
    if (quantityError.severity === 'error') {
      errors.push(quantityError);
    } else {
      warnings.push(quantityError);
    }
  }

  if (food.nutritionFacts) {
    const nutritionErrors = validateNutritionValues(food.nutritionFacts, 'food.nutritionFacts', config);
    for (const err of nutritionErrors) {
      if (err.severity === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    }
  }

  if (food.conversionInfo?.nutritionPer100g) {
    const conversionErrors = validateNutritionValues(
      food.conversionInfo.nutritionPer100g,
      'food.conversionInfo.nutritionPer100g',
      config
    );
    for (const err of conversionErrors) {
      if (err.severity === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    }
  }

  let correctedQuantity = quantity;
  if (config.autoCorrectWarnings && warnings.length > 0) {
    const min = config.minQuantity ?? DEFAULT_DATA_QUALITY_CONFIG.minQuantity;
    const max = config.maxQuantity ?? DEFAULT_DATA_QUALITY_CONFIG.maxQuantity;
    if (quantity < min) correctedQuantity = min;
    if (quantity > max) correctedQuantity = max;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    correctedData: {
      food,
      quantity: correctedQuantity,
      unit,
    },
  };
};

export const validateWaterRecord = (
  amount: number,
  unit: UnitType,
  options?: {
    timestamp?: number;
    config?: Partial<DataQualityConfig>;
  }
): ValidationResult<{ amount: number; unit: UnitType; timestamp: number }> => {
  const { timestamp = Date.now(), config = {} } = options || {};
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const waterUnits = [UnitType.MILLILITER, UnitType.LITER, UnitType.CUP];
  const unitError = validateUnit(unit, waterUnits, 'unit');
  if (unitError) errors.push(unitError);

  let min: number, max: number;
  if (unit === UnitType.LITER) {
    min = 0.01;
    max = 5;
  } else if (unit === UnitType.CUP) {
    min = 0.1;
    max = 20;
  } else {
    min = 10;
    max = 5000;
  }

  const amountError = validateQuantity(amount, 'amount', { ...config, minQuantity: min, maxQuantity: max });
  if (amountError) {
    if (amountError.severity === 'error') {
      errors.push(amountError);
    } else {
      warnings.push(amountError);
    }
  }

  const timeError = validateTimestamp(timestamp, 'timestamp', config);
  if (timeError) {
    if (timeError.severity === 'error') {
      errors.push(timeError);
    } else {
      warnings.push(timeError);
    }
  }

  let correctedAmount = amount;
  let correctedTimestamp = timestamp;
  if (config.autoCorrectWarnings && warnings.length > 0) {
    if (amount < min) correctedAmount = min;
    if (amount > max) correctedAmount = max;

    const now = Date.now();
    const maxFutureTime = now + (config.maxFutureDays ?? DEFAULT_DATA_QUALITY_CONFIG.maxFutureDays) * 24 * 60 * 60 * 1000;
    if (timestamp > maxFutureTime) correctedTimestamp = now;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    correctedData: {
      amount: correctedAmount,
      unit,
      timestamp: correctedTimestamp,
    },
  };
};

export const validateWeightRecord = (
  weight: number,
  unit: UnitType,
  options?: {
    timestamp?: number;
    config?: Partial<DataQualityConfig>;
  }
): ValidationResult<{ weight: number; unit: UnitType; timestamp: number }> => {
  const { timestamp = Date.now(), config = {} } = options || {};
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const weightUnits = [UnitType.KILOGRAM, UnitType.POUND, UnitType.OUNCE, UnitType.GRAM];
  const unitError = validateUnit(unit, weightUnits, 'unit');
  if (unitError) errors.push(unitError);

  const weightConfig = { ...config, minQuantity: 20, maxQuantity: 300 };
  if (unit === UnitType.POUND) {
    weightConfig.minQuantity = 44;
    weightConfig.maxQuantity = 660;
  }
  const weightError = validateQuantity(weight, 'weight', weightConfig);
  if (weightError) {
    if (weightError.severity === 'error') {
      errors.push(weightError);
    } else {
      warnings.push(weightError);
    }
  }

  const timeError = validateTimestamp(timestamp, 'timestamp', config);
  if (timeError) {
    if (timeError.severity === 'error') {
      errors.push(timeError);
    } else {
      warnings.push(timeError);
    }
  }

  let correctedWeight = weight;
  let correctedTimestamp = timestamp;
  if (config.autoCorrectWarnings && warnings.length > 0) {
    const min = unit === UnitType.POUND ? 44 : 20;
    const max = unit === UnitType.POUND ? 660 : 300;
    if (weight < min) correctedWeight = min;
    if (weight > max) correctedWeight = max;

    const now = Date.now();
    const maxFutureTime = now + (config.maxFutureDays ?? DEFAULT_DATA_QUALITY_CONFIG.maxFutureDays) * 24 * 60 * 60 * 1000;
    if (timestamp > maxFutureTime) correctedTimestamp = now;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    correctedData: {
      weight: correctedWeight,
      unit,
      timestamp: correctedTimestamp,
    },
  };
};

export const createBatchResult = async <T, R = T>(
  items: T[],
  validateFn: (item: T, index: number) => Promise<{ valid: boolean; errors: ValidationError[]; warnings: ValidationError[]; data?: R; id?: string }>
): Promise<BatchOperationResult<R, T>> => {
  const successful: Array<{ index: number; data: R; id?: string }> = [];
  const failed: Array<{ index: number; data: T; errors: ValidationError[] }> = [];
  const warnings: Array<{ index: number; data: R; warnings: ValidationError[] }> = [];
  const results: Array<{
    index: number;
    valid: boolean;
    data?: R;
    input: T;
    errors: ValidationError[];
    warnings: ValidationError[];
  }> = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const result = await validateFn(item, index);
    
    results.push({
      index,
      valid: result.valid,
      data: result.data,
      input: item,
      errors: result.errors,
      warnings: result.warnings,
    });

    if (result.valid && result.data !== undefined) {
      successful.push({ index, data: result.data, id: result.id });
      if (result.warnings.length > 0) {
        warnings.push({ index, data: result.data, warnings: result.warnings });
      }
    } else {
      failed.push({ index, data: item, errors: result.errors });
    }
  }

  return {
    successCount: successful.length,
    failureCount: failed.length,
    totalCount: items.length,
    successful,
    failed,
    warnings,
    results,
  };
};

export const describeWeightTrend = (
  weightChange: number,
  days: number,
  goalDirection: 'up' | 'down' | 'stable'
): WeightTrendDescription => {
  if (days < 3 || Math.abs(weightChange) < 0.1) {
    return 'insufficient_data';
  }

  const weeklyChange = (weightChange / days) * 7;

  if (Math.abs(weeklyChange) < 0.2) {
    return 'maintaining_stable';
  }

  if (weeklyChange < 0) {
    if (Math.abs(weeklyChange) <= 0.5) return 'slowly_losing';
    if (Math.abs(weeklyChange) <= 1) return 'moderate_loss';
    return 'significant_loss';
  } else {
    if (weeklyChange <= 0.5) return 'slowly_gaining';
    if (weeklyChange <= 1) return 'moderate_gain';
    return 'significant_gain';
  }
};

export const getWeightChangeCategory = (weeklyChange: number): 'small' | 'moderate' | 'significant' => {
  const absChange = Math.abs(weeklyChange);
  if (absChange < 0.3) return 'small';
  if (absChange < 0.8) return 'moderate';
  return 'significant';
};

export const createDesensitizedWeightInfo = (
  weightChange: number,
  startWeight: number,
  endWeight: number,
  days: number,
  goalDirection: 'up' | 'down' | 'stable'
): DesensitizedWeightInfo => {
  const trend = describeWeightTrend(weightChange, days, goalDirection);
  
  let direction: 'up' | 'down' | 'stable' = 'stable';
  if (trend === 'slowly_losing' || trend === 'moderate_loss' || trend === 'significant_loss') {
    direction = 'down';
  } else if (trend === 'slowly_gaining' || trend === 'moderate_gain' || trend === 'significant_gain') {
    direction = 'up';
  }

  const weeklyChange = days > 0 ? (weightChange / days) * 7 : 0;
  const changeCategory = getWeightChangeCategory(weeklyChange);

  const descriptions: Record<WeightTrendDescription, string> = {
    maintaining_stable: '体重基本保持稳定',
    slowly_losing: '体重呈缓慢下降趋势',
    moderate_loss: '体重呈中度下降趋势',
    significant_loss: '体重呈明显下降趋势',
    slowly_gaining: '体重呈缓慢上升趋势',
    moderate_gain: '体重呈中度上升趋势',
    significant_gain: '体重呈明显上升趋势',
    insufficient_data: '数据不足，暂无法判断体重趋势',
  };

  return {
    trend,
    direction,
    description: descriptions[trend],
    changeCategory,
  };
};
