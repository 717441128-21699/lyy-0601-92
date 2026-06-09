import {
  UserProfile,
  UserGoals,
  Gender,
  ActivityLevel,
  DietGoal,
  UnitType,
  SDKConfig,
} from '../types';
import { generateId, getTimestamp, roundTo, convertUnit } from '../utils/helpers';

interface BMRResult {
  bmr: number;
  tdee: number;
  method: string;
}

export class GoalCalculationManager {
  private config: SDKConfig;
  private goals: Map<string, UserGoals> = new Map();

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async calculateBMR(profile: UserProfile): Promise<BMRResult> {
    const { gender, weight, height, birthDate } = profile;

    if (!weight || !height) {
      return { bmr: 0, tdee: 0, method: 'insufficient_data' };
    }

    let weightKg = weight;
    let heightCm = height;

    if (profile.weightUnit === UnitType.POUND) {
      weightKg = convertUnit(weight, UnitType.POUND, UnitType.KILOGRAM);
    }

    if (profile.heightUnit === UnitType.INCH) {
      heightCm = convertUnit(height, UnitType.INCH, UnitType.CENTIMETER);
    } else if (profile.heightUnit === UnitType.METER) {
      heightCm = height * 100;
    }

    let age = 30;
    if (birthDate) {
      const now = new Date();
      const birth = new Date(birthDate);
      age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
    }

    let bmr: number;
    let method: string;

    if (gender === Gender.MALE) {
      bmr = 88.362 + (13.397 * weightKg) + (4.799 * heightCm) - (5.677 * age);
      method = 'Mifflin-St Jeor (Male)';
    } else if (gender === Gender.FEMALE) {
      bmr = 447.593 + (9.247 * weightKg) + (3.098 * heightCm) - (4.330 * age);
      method = 'Mifflin-St Jeor (Female)';
    } else {
      bmr = (88.362 + 447.593) / 2 + (11.322 * weightKg) + (3.948 * heightCm) - (5.003 * age);
      method = 'Mifflin-St Jeor (Average)';
    }

    const activityMultipliers: Record<ActivityLevel, number> = {
      [ActivityLevel.SEDENTARY]: 1.2,
      [ActivityLevel.LIGHT]: 1.375,
      [ActivityLevel.MODERATE]: 1.55,
      [ActivityLevel.ACTIVE]: 1.725,
      [ActivityLevel.VERY_ACTIVE]: 1.9,
    };

    const activityLevel = profile.activityLevel || ActivityLevel.LIGHT;
    const tdee = bmr * activityMultipliers[activityLevel];

    return {
      bmr: roundTo(bmr, 0),
      tdee: roundTo(tdee, 0),
      method,
    };
  }

  async calculateDailyCalories(profile: UserProfile): Promise<{
    maintenance: number;
    target: number;
    adjustment: number;
    reason: string;
  }> {
    const { tdee } = await this.calculateBMR(profile);
    const dietGoal = profile.dietGoal || DietGoal.MAINTAIN;

    let adjustment = 0;
    let reason = '';

    switch (dietGoal) {
      case DietGoal.LOSE_WEIGHT:
        adjustment = -500;
        reason = '减脂目标：每日减少500大卡，预计每周减重0.5kg';
        break;
      case DietGoal.GAIN_WEIGHT:
        adjustment = 300;
        reason = '增重目标：每日增加300大卡，预计每周增重0.3kg';
        break;
      case DietGoal.BUILD_MUSCLE:
        adjustment = 250;
        reason = '增肌目标：每日增加250大卡，配合力量训练';
        break;
      default:
        adjustment = 0;
        reason = '维持目标：保持当前热量摄入';
    }

    return {
      maintenance: tdee,
      target: roundTo(tdee + adjustment, 0),
      adjustment,
      reason,
    };
  }

  async calculateMacronutrientTargets(
    dailyCalories: number,
    profile: UserProfile,
    customRatio?: { protein: number; carbs: number; fat: number }
  ): Promise<{
    protein: { grams: number; calories: number; ratio: number };
    carbs: { grams: number; calories: number; ratio: number };
    fat: { grams: number; calories: number; ratio: number };
  }> {
    let ratio = customRatio;

    if (!ratio) {
      switch (profile.dietGoal) {
        case DietGoal.LOSE_WEIGHT:
          ratio = { protein: 35, carbs: 35, fat: 30 };
          break;
        case DietGoal.GAIN_WEIGHT:
          ratio = { protein: 25, carbs: 50, fat: 25 };
          break;
        case DietGoal.BUILD_MUSCLE:
          ratio = { protein: 40, carbs: 40, fat: 20 };
          break;
        default:
          ratio = { protein: 25, carbs: 50, fat: 25 };
      }
    }

    const proteinCalories = (dailyCalories * ratio.protein) / 100;
    const carbsCalories = (dailyCalories * ratio.carbs) / 100;
    const fatCalories = (dailyCalories * ratio.fat) / 100;

    return {
      protein: {
        grams: roundTo(proteinCalories / 4, 1),
        calories: roundTo(proteinCalories, 0),
        ratio: ratio.protein,
      },
      carbs: {
        grams: roundTo(carbsCalories / 4, 1),
        calories: roundTo(carbsCalories, 0),
        ratio: ratio.carbs,
      },
      fat: {
        grams: roundTo(fatCalories / 9, 1),
        calories: roundTo(fatCalories, 0),
        ratio: ratio.fat,
      },
    };
  }

  async calculateWaterGoal(profile: UserProfile): Promise<{
    dailyWater: number;
    unit: UnitType;
    cups: number;
    reason: string;
  }> {
    const { weight, activityLevel } = profile;

    if (!weight) {
      return { dailyWater: 2000, unit: UnitType.MILLILITER, cups: 8, reason: '默认推荐: 每日2000ml（约8杯）' };
    }

    let weightKg = weight;
    if (profile.weightUnit === UnitType.POUND) {
      weightKg = convertUnit(weight, UnitType.POUND, UnitType.KILOGRAM);
    }

    let baseWater = weightKg * 35;

    const activityBonus: Record<ActivityLevel, number> = {
      [ActivityLevel.SEDENTARY]: 0,
      [ActivityLevel.LIGHT]: 100,
      [ActivityLevel.MODERATE]: 200,
      [ActivityLevel.ACTIVE]: 350,
      [ActivityLevel.VERY_ACTIVE]: 500,
    };

    const activity = activityLevel || ActivityLevel.LIGHT;
    const totalWater = baseWater + activityBonus[activity];

    return {
      dailyWater: roundTo(totalWater, 0),
      unit: UnitType.MILLILITER,
      cups: roundTo(totalWater / 240, 1),
      reason: `体重${weightKg}kg × 35ml + 活动量${activityBonus[activity]}ml`,
    };
  }

  async calculateWeightGoal(profile: UserProfile): Promise<{
    targetWeight: number;
    unit: UnitType;
    weeklyChange: number;
    estimatedWeeks: number;
    targetDate: number;
    recommendation: string;
  }> {
    const { weight, targetWeight, dietGoal } = profile;

    if (!weight) {
      return {
        targetWeight: 0,
        unit: profile.weightUnit || UnitType.KILOGRAM,
        weeklyChange: 0,
        estimatedWeeks: 0,
        targetDate: getTimestamp(),
        recommendation: '请先记录当前体重',
      };
    }

    const unit = profile.weightUnit || UnitType.KILOGRAM;
    let currentWeight = weight;
    let goalWeight = targetWeight;

    if (!goalWeight) {
      if (dietGoal === DietGoal.LOSE_WEIGHT) {
        goalWeight = currentWeight * 0.9;
      } else if (dietGoal === DietGoal.GAIN_WEIGHT || dietGoal === DietGoal.BUILD_MUSCLE) {
        goalWeight = currentWeight * 1.05;
      } else {
        goalWeight = currentWeight;
      }
    }

    const weightDiff = goalWeight - currentWeight;

    let weeklyChange = 0;
    let recommendation = '';

    if (weightDiff < -0.5) {
      weeklyChange = Math.max(weightDiff, -1);
      recommendation = '健康减脂速度：每周减重0.5-1kg';
    } else if (weightDiff > 0.5) {
      weeklyChange = Math.min(weightDiff, 0.5);
      recommendation = '健康增重速度：每周增重0.25-0.5kg';
    } else {
      weeklyChange = 0;
      recommendation = '当前体重接近目标，建议维持';
    }

    const estimatedWeeks = weeklyChange !== 0
      ? Math.ceil(Math.abs(weightDiff) / Math.abs(weeklyChange))
      : 0;

    const targetDate = estimatedWeeks > 0
      ? getTimestamp() + estimatedWeeks * 7 * 24 * 60 * 60 * 1000
      : getTimestamp();

    return {
      targetWeight: roundTo(goalWeight, 1),
      unit,
      weeklyChange: roundTo(weeklyChange, 2),
      estimatedWeeks,
      targetDate,
      recommendation,
    };
  }

  async generateGoals(profile: UserProfile, options?: {
    customCalories?: number;
    customMacronutrientRatio?: { protein: number; carbs: number; fat: number };
    customWater?: number;
    customTargetWeight?: number;
    customMealFrequency?: number;
    exerciseMinutes?: number;
    sleepHours?: number;
  }): Promise<UserGoals> {
    const userId = profile.userId;

    const calorieResult = options?.customCalories
      ? { maintenance: options.customCalories, target: options.customCalories, adjustment: 0, reason: '自定义' }
      : await this.calculateDailyCalories(profile);

    const macroTargets = await this.calculateMacronutrientTargets(
      calorieResult.target,
      profile,
      options?.customMacronutrientRatio
    );

    const waterGoal = options?.customWater
      ? { dailyWater: options.customWater, unit: UnitType.MILLILITER, cups: 0, reason: '自定义' }
      : await this.calculateWaterGoal(profile);

    const weightGoal = options?.customTargetWeight
      ? {
          targetWeight: options.customTargetWeight,
          unit: profile.weightUnit || UnitType.KILOGRAM,
          weeklyChange: 0,
          estimatedWeeks: 0,
          targetDate: getTimestamp(),
          recommendation: '自定义',
        }
      : await this.calculateWeightGoal(profile);

    const goals: UserGoals = {
      userId,
      dailyCalories: calorieResult.target,
      dailyProtein: macroTargets.protein.grams,
      dailyCarbs: macroTargets.carbs.grams,
      dailyFat: macroTargets.fat.grams,
      dailyWater: waterGoal.dailyWater,
      waterUnit: waterGoal.unit,
      targetWeight: weightGoal.targetWeight,
      targetWeightUnit: weightGoal.unit,
      weeklyWeightChange: weightGoal.weeklyChange,
      mealFrequency: options?.customMealFrequency || 3,
      exerciseMinutes: options?.exerciseMinutes,
      sleepHours: options?.sleepHours,
      macronutrientRatio: {
        protein: macroTargets.protein.ratio,
        carbs: macroTargets.carbs.ratio,
        fat: macroTargets.fat.ratio,
      },
    };

    this.goals.set(userId, goals);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`goals:${userId}`, goals);
    }

    return goals;
  }

  async getGoals(userId: string): Promise<UserGoals | null> {
    const cached = this.goals.get(userId);
    if (cached) return cached;

    if (this.config.storageAdapter) {
      const goals = await this.config.storageAdapter.get<UserGoals>(`goals:${userId}`);
      if (goals) {
        this.goals.set(userId, goals);
        return goals;
      }
    }

    return null;
  }

  async updateGoals(userId: string, updates: Partial<UserGoals>): Promise<UserGoals | null> {
    const existing = await this.getGoals(userId);
    if (!existing) return null;

    const updated: UserGoals = {
      ...existing,
      ...updates,
    };

    this.goals.set(userId, updated);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`goals:${userId}`, updated);
    }

    return updated;
  }

  async adjustGoalBasedOnProgress(
    userId: string,
    currentWeight: number,
    weightUnit: UnitType,
    actualCalories: number,
    periodDays: number = 7
  ): Promise<{
    shouldAdjust: boolean;
    suggestedCalories: number;
    reason: string;
    updatedGoals?: UserGoals;
  }> {
    const goals = await this.getGoals(userId);
    if (!goals) {
      return { shouldAdjust: false, suggestedCalories: 0, reason: '未设置目标' };
    }

    if (periodDays < 7) {
      return { shouldAdjust: false, suggestedCalories: goals.dailyCalories, reason: '观察期不足7天，暂不调整' };
    }

    const expectedWeeklyChange = goals.weeklyWeightChange;
    const expectedChange = expectedWeeklyChange * (periodDays / 7);

    let currentWeightKg = currentWeight;
    let targetWeightKg = goals.targetWeight;

    if (weightUnit === UnitType.POUND) {
      currentWeightKg = convertUnit(currentWeight, UnitType.POUND, UnitType.KILOGRAM);
    }
    if (goals.targetWeightUnit === UnitType.POUND) {
      targetWeightKg = convertUnit(goals.targetWeight, UnitType.POUND, UnitType.KILOGRAM);
    }

    const remainingToGoal = targetWeightKg - currentWeightKg;

    if (Math.abs(remainingToGoal) < 0.5) {
      return {
        shouldAdjust: true,
        suggestedCalories: Math.round(goals.dailyCalories * 0.95),
        reason: '已接近目标体重，建议适当减少热量摄入',
      };
    }

    const calorieDiff = actualCalories - goals.dailyCalories;

    if (Math.abs(calorieDiff) > 200) {
      const adjustment = Math.sign(calorieDiff) * 150;
      return {
        shouldAdjust: true,
        suggestedCalories: goals.dailyCalories + adjustment,
        reason: `实际摄入与目标相差${Math.abs(calorieDiff)}大卡，建议调整`,
      };
    }

    return {
      shouldAdjust: false,
      suggestedCalories: goals.dailyCalories,
      reason: '进展正常，保持当前目标',
    };
  }

  async getGoalTimeline(goals: UserGoals): Promise<{
    milestones: Array<{ date: number; weight: number; description: string }>;
    totalDays: number;
  }> {
    const milestones: Array<{ date: number; weight: number; description: string }> = [];
    const now = getTimestamp();

    const targetWeightKg = goals.targetWeightUnit === UnitType.POUND
      ? convertUnit(goals.targetWeight, UnitType.POUND, UnitType.KILOGRAM)
      : goals.targetWeight;

    const weeklyChangeKg = Math.abs(goals.weeklyWeightChange);
    const totalWeeks = weeklyChangeKg > 0
      ? Math.ceil(Math.abs(targetWeightKg - (goals.targetWeight - goals.weeklyWeightChange * 10)) / weeklyChangeKg)
      : 0;

    const totalDays = totalWeeks * 7;

    for (let i = 1; i <= Math.min(totalWeeks, 8); i++) {
      const date = now + i * 7 * 24 * 60 * 60 * 1000;
      const expectedWeight = goals.targetWeight + goals.weeklyWeightChange * (totalWeeks - i);

      let description = '';
      if (i === totalWeeks) {
        description = '达成目标';
      } else if (i === 1) {
        description = '第一周';
      } else if (i === Math.floor(totalWeeks / 2)) {
        description = '半程里程碑';
      } else {
        description = `第${i}周`;
      }

      milestones.push({
        date,
        weight: roundTo(expectedWeight, 1),
        description,
      });
    }

    return { milestones, totalDays };
  }
}
