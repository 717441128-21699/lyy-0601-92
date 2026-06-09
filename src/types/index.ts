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
}

export interface StorageAdapter {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
  list: <T>(prefix: string) => Promise<T[]>;
}
