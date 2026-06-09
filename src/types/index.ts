export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other'
}

export enum ActivityLevel {
  SEDENTARY = 'sedentary',
  LIGHT = 'light',
  MODERATE = 'moderate',
  ACTIVE = 'active',
  VERY_ACTIVE = 'very_active'
}

export enum DietGoal {
  LOSE_WEIGHT = 'lose_weight',
  MAINTAIN = 'maintain',
  GAIN_WEIGHT = 'gain_weight',
  BUILD_MUSCLE = 'build_muscle'
}

export enum MealType {
  BREAKFAST = 'breakfast',
  LUNCH = 'lunch',
  DINNER = 'dinner',
  SNACK = 'snack'
}

export enum UnitType {
  GRAM = 'g',
  KILOGRAM = 'kg',
  MILLILITER = 'ml',
  LITER = 'l',
  OUNCE = 'oz',
  POUND = 'lb',
  CUP = 'cup',
  TABLESPOON = 'tbsp',
  TEASPOON = 'tsp',
  PIECE = 'piece',
  CENTIMETER = 'cm',
  INCH = 'in',
  METER = 'm'
}

export enum AllergenType {
  PEANUT = 'peanut',
  TREE_NUT = 'tree_nut',
  MILK = 'milk',
  EGG = 'egg',
  WHEAT = 'wheat',
  SOY = 'soy',
  FISH = 'fish',
  SHELLFISH = 'shellfish',
  SESAME = 'sesame',
  CELERY = 'celery',
  MUSTARD = 'mustard',
  LUPIN = 'lupin',
  MOLLUSC = 'mollusc',
  SULPHITE = 'sulphite'
}

export enum DietPreference {
  VEGETARIAN = 'vegetarian',
  VEGAN = 'vegan',
  PESCETARIAN = 'pescetarian',
  KETO = 'keto',
  LOW_CARB = 'low_carb',
  HIGH_PROTEIN = 'high_protein',
  GLUTEN_FREE = 'gluten_free',
  DAIRY_FREE = 'dairy_free',
  HALAL = 'halal',
  KOSHER = 'kosher',
  LOW_SODIUM = 'low_sodium',
  LOW_SUGAR = 'low_sugar',
  MEDITERRANEAN = 'mediterranean',
  PALEO = 'paleo',
  INTERMITTENT_FASTING = 'intermittent_fasting'
}

export interface NutritionFacts {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  cholesterol?: number;
  saturatedFat?: number;
  transFat?: number;
  vitaminA?: number;
  vitaminC?: number;
  calcium?: number;
  iron?: number;
}

export interface ServingInfo {
  size: number;
  unit: UnitType;
  name: string;
  grams: number;
}

export interface CupInfo {
  size: number;
  unit: UnitType;
  grams: number;
  description?: string;
}

export interface CookingConversion {
  rawToCookedRatio: number;
  cookingMethod: string;
  nutritionRetentionRate: number;
}

export interface FoodConversionInfo {
  nutritionPer100g: NutritionFacts;
  servingInfo?: ServingInfo;
  cupInfo?: CupInfo;
  cookingConversion?: CookingConversion;
  ediblePortion?: number;
}

export interface FoodItem {
  id: string;
  name: string;
  category: string;
  servingSize: number;
  servingUnit: UnitType;
  nutritionFacts: NutritionFacts;
  allergens?: AllergenType[];
  tags?: string[];
  isFavorite?: boolean;
  conversionInfo?: FoodConversionInfo;
}

export interface MealFoodEntry {
  foodId: string;
  foodName: string;
  quantity: number;
  unit: UnitType;
  normalizedQuantity: number;
  normalizedUnit: UnitType;
  nutritionFacts: NutritionFacts;
}

export interface MealRecord {
  id: string;
  userId: string;
  mealType: MealType;
  timestamp: number;
  foods: MealFoodEntry[];
  totalNutrition: NutritionFacts;
  notes?: string;
  mood?: string;
  location?: string;
}

export interface WeightRecord {
  id: string;
  userId: string;
  weight: number;
  unit: UnitType;
  normalizedWeightKg: number;
  timestamp: number;
  note?: string;
  bodyFat?: number;
  muscleMass?: number;
  waterWeight?: number;
  boneMass?: number;
}

export interface WaterRecord {
  id: string;
  userId: string;
  amount: number;
  unit: UnitType;
  normalizedAmountMl: number;
  timestamp: number;
  cupSize?: number;
  cups?: number;
}

export interface UserProfile {
  userId: string;
  nickname?: string;
  avatar?: string;
  gender?: Gender;
  birthDate?: number;
  height?: number;
  heightUnit?: UnitType;
  weight?: number;
  weightUnit?: UnitType;
  activityLevel?: ActivityLevel;
  dietGoal?: DietGoal;
  targetWeight?: number;
  allergies?: AllergenType[];
  preferences?: DietPreference[];
  dislikedFoods?: string[];
  medicalConditions?: string[];
  medications?: string[];
  timezone?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserGoals {
  userId: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  dailyWater: number;
  waterUnit: UnitType;
  targetWeight: number;
  targetWeightUnit: UnitType;
  weeklyWeightChange: number;
  mealFrequency: number;
  dietGoal: DietGoal;
  exerciseMinutes?: number;
  sleepHours?: number;
  macronutrientRatio: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface ReminderRule {
  id: string;
  userId: string;
  type: 'meal' | 'water' | 'weight' | 'medication';
  enabled: boolean;
  time: string;
  label?: string;
  repeatDays?: number[];
  snoozeEnabled?: boolean;
  preMealReminder?: boolean;
  preMealMinutes?: number;
}

export interface AlertRule {
  id: string;
  userId: string;
  type: 'calories_exceed' | 'nutrient_exceed' | 'allergen_risk' | 'weight_fluctuation' | 'missing_meal';
  enabled: boolean;
  threshold?: number;
  notificationChannel?: 'push' | 'email' | 'sms';
}

export interface FoodCombination {
  id: string;
  userId: string;
  name: string;
  foods: MealFoodEntry[];
  mealType: MealType;
  usageCount: number;
  lastUsed: number;
  totalNutrition: NutritionFacts;
}

export interface DailyCheckInDetail {
  date: number;
  mealCount: number;
  targetMeals: number;
  status: 'empty' | 'partial' | 'complete';
  description: string;
}

export interface WeeklyReport {
  userId: string;
  startDate: number;
  endDate: number;
  averageDailyCalories: number;
  averageDailyNutrition: NutritionFacts;
  calorieGoalAchievement: number;
  proteinGoalAchievement: number;
  carbsGoalAchievement: number;
  fatGoalAchievement: number;
  waterIntakeAverage: number;
  waterGoalAchievement: number;
  weightTrend: number[];
  weightChange: number;
  mealFrequency: Record<MealType, number>;
  topFoods: { name: string; count: number }[];
  checkInDays: number;
  checkInStreak: number;
  missedMeals: number;
  dailyCheckInDetails: DailyCheckInDetail[];
  nutrientGaps: { nutrient: string; gap: number; suggestion: string; percentage: number }[];
  abnormalFluctuations: { date: number; weightChange: number; description: string; possibleReasons: string[] }[];
  weeklySummary: string;
  suggestions: string[];
}

export interface TrendComparison {
  currentValue: number;
  previousValue: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  description: string;
}

export interface HealthScoreBreakdown {
  nutrition: number;
  water: number;
  weight: number;
  consistency: number;
  total: number;
}

export interface TrendAnalysis {
  period: {
    currentStart: number;
    currentEnd: number;
    previousStart: number;
    previousEnd: number;
  };
  calories: TrendComparison;
  protein: TrendComparison;
  water: TrendComparison;
  weight: TrendComparison;
  healthScore: HealthScoreBreakdown;
  weeklyComparison: {
    currentWeek: {
      averageDailyCalories: number;
      averageDailyProtein: number;
      averageDailyWater: number;
      averageWeight: number;
      checkInDays: number;
      completeDays: number;
    };
    previousWeek: {
      averageDailyCalories: number;
      averageDailyProtein: number;
      averageDailyWater: number;
      averageWeight: number;
      checkInDays: number;
      completeDays: number;
    };
  };
  insights: string[];
}

export interface MonthlyReport {
  userId: string;
  startDate: number;
  endDate: number;
  averageDailyCalories: number;
  averageDailyNutrition: NutritionFacts;
  calorieGoalAchievement: number;
  weightTrend: number[];
  weightChange: number;
  checkInDays: number;
  checkInStreak: number;
  summary: string;
  suggestions: string[];
}

export interface NutrientGap {
  nutrient: keyof NutritionFacts;
  current: number;
  target: number;
  gap: number;
  percentage: number;
  suggestion: string;
}

export interface CheckInStatus {
  todayChecked: boolean;
  currentStreak: number;
  longestStreak: number;
  totalCheckIns: number;
  checkInDates: number[];
}

export interface UnitConversionRate {
  from: UnitType;
  to: UnitType;
  rate: number;
  foodCategory?: string;
}

export interface DesensitizeOptions {
  maskUserId?: boolean;
  maskWeight?: boolean;
  maskHeight?: boolean;
  maskBirthDate?: boolean;
  maskAllergies?: boolean;
  maskMedicalInfo?: boolean;
}

export interface SDKConfig {
  storageAdapter?: StorageAdapter;
  timezone?: string;
  locale?: string;
  desensitize?: DesensitizeOptions;
  dataQuality?: Partial<DataQualityConfig>;
}

export interface StorageAdapter {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
  list: <T>(prefix: string) => Promise<T[]>;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationErrorCode = 
  | 'INVALID_UNIT'
  | 'INVALID_QUANTITY'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_NUTRITION_VALUE'
  | 'QUANTITY_TOO_LOW'
  | 'QUANTITY_TOO_HIGH'
  | 'TIMESTAMP_IN_FUTURE'
  | 'TIMESTAMP_TOO_OLD'
  | 'NUTRITION_IMBALANCED'
  | 'UNIT_MISMATCH'
  | 'FOOD_NOT_FOUND'
  | 'DUPLICATE_RECORD';

export interface ValidationError {
  code: ValidationErrorCode;
  severity: ValidationSeverity;
  field: string;
  message: string;
  suggestion: string;
  currentValue: any;
  expectedRange?: { min?: number; max?: number };
  suggestedValue?: any;
}

export interface ValidationResult<T = any> {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  data?: T;
  correctedData?: T;
}

export interface BatchOperationResult<T = any, TInput = any> {
  successCount: number;
  failureCount: number;
  totalCount: number;
  successful: Array<{ index: number; data: T; id?: string }>;
  failed: Array<{ index: number; data: TInput; errors: ValidationError[] }>;
  warnings: Array<{ index: number; data: T; warnings: ValidationError[] }>;
  results: Array<{
    index: number;
    valid: boolean;
    data?: T;
    input: TInput;
    errors: ValidationError[];
    warnings: ValidationError[];
  }>;
}

export type ConflictResolutionStrategy = 
  | 'last_write_wins'
  | 'first_write_wins'
  | 'merge_by_timestamp'
  | 'manual'
  | 'keep_higher_quantity'
  | 'keep_more_recent_nutrition';

export interface ConflictInfo {
  key: string;
  existingValue: any;
  incomingValue: any;
  existingTimestamp: number;
  incomingTimestamp: number;
  resolution: ConflictResolutionStrategy;
  mergedValue?: any;
}

export interface SyncMergeResult {
  mergedKeys: string[];
  conflictCount: number;
  conflicts: ConflictInfo[];
  importedCount: number;
  skippedCount: number;
  rollbackToken: string;
}

export interface RollbackResult {
  success: boolean;
  rollbackToken: string;
  restoredCount: number;
  restoredKeys: string[];
  error?: string;
}

export interface IncrementalExportOptions {
  sinceTimestamp?: number;
  userId?: string;
  recordTypes?: Array<'meal' | 'water' | 'weight' | 'profile' | 'favorite' | 'combination'>;
  includeDeleted?: boolean;
}

export interface ExecutionInsight {
  type: 'success' | 'warning' | 'info' | 'error';
  category: 'check_in' | 'calorie' | 'water' | 'weight' | 'general';
  priority: number;
  title: string;
  message: string;
  action: string;
  metric: string | null;
  current: number | null;
  target: number | null;
}

export interface GoalExecutionAnalysis {
  period: { start: number; end: number; days: number };
  overallScore: number;
  insights: ExecutionInsight[];
  checkInAnalysis: {
    totalDays: number;
    checkInDays: number;
    completeDays: number;
    checkInRate: number;
    completionRate: number;
    currentStreak: number;
    maxStreak: number;
    mealTypeBreakdown: {
      breakfast: number;
      lunch: number;
      dinner: number;
      snack: number;
    };
    score: number;
  };
  calorieAnalysis: {
    averageDailyCalories: number;
    targetCalories: number;
    deviationPercent: number;
    deviationDirection: 'over' | 'under' | 'on_target';
    recordedDays: number;
    achievedDays: number;
    achievedRate: number;
    totalCalories: number;
    score: number;
  };
  waterAnalysis: {
    averageDailyWaterMl: number;
    targetWaterMl: number;
    recordedDays: number;
    achievedDays: number;
    achievedRate: number;
    averageAchievementRate: number;
    totalWaterMl: number;
    score: number;
  };
  weightAnalysis: {
    startWeight: number | null;
    endWeight: number | null;
    weightChange: number | null;
    changePercent: number | null;
    direction: 'up' | 'down' | 'stable';
    goalDirection: 'up' | 'down' | 'stable';
    isOnTrack: boolean;
    recordedDays: number;
    weeklyRate: number | null;
    desensitizedInfo: DesensitizedWeightInfo;
    score: number;
  };
  summary: string;
  personalizedRecommendations: string[];
}

export type WeightTrendDescription = 
  | 'maintaining_stable'
  | 'slowly_losing'
  | 'moderate_loss'
  | 'significant_loss'
  | 'slowly_gaining'
  | 'moderate_gain'
  | 'significant_gain'
  | 'insufficient_data';

export interface DesensitizedWeightInfo {
  trend: WeightTrendDescription;
  direction: 'up' | 'down' | 'stable';
  description: string;
  changeCategory: 'small' | 'moderate' | 'significant';
}

export interface DataQualityConfig {
  enableValidation: boolean;
  rejectOnError: boolean;
  autoCorrectWarnings: boolean;
  maxFutureDays: number;
  maxPastDays: number;
  minQuantity: number;
  maxQuantity: number;
  nutritionRanges: Partial<Record<keyof NutritionFacts, { min: number; max: number; per100g: boolean }>>;
}
