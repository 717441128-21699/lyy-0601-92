import {
  UserProfile,
  UserGoals,
  MealRecord,
  NutritionFacts,
  NutrientGap,
  CheckInStatus,
  SDKConfig,
  MealType,
  UnitType,
} from '../types';
import {
  getStartOfDay,
  getEndOfDay,
  sumNutrition,
  averageNutrition,
  roundTo,
  isSameDay,
  getTimestamp,
  getDaysDiff,
} from '../utils/helpers';

interface DailySummary {
  date: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  mealCount: number;
  mealsByType: Record<MealType, number>;
}

interface TrendAnalysis {
  nutrient: string;
  current: number;
  average: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: number;
}

export class NutritionSummaryManager {
  private config: SDKConfig;

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async calculateDailySummary(
    meals: MealRecord[],
    waterIntake: { amount: number; unit: UnitType } = { amount: 0, unit: UnitType.MILLILITER }
  ): Promise<NutritionFacts & { mealCount: number; waterMl: number }> {
    const nutritionSum = meals.length > 0
      ? sumNutrition(meals.map(m => m.totalNutrition))
      : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    let waterMl = waterIntake.amount;
    if (waterIntake.unit === UnitType.LITER) {
      waterMl = waterIntake.amount * 1000;
    }

    return {
      ...nutritionSum,
      mealCount: meals.length,
      waterMl,
    };
  }

  async calculateDailySummaryWithGoals(
    meals: MealRecord[],
    goals: UserGoals,
    waterIntake: { amount: number; unit: UnitType } = { amount: 0, unit: UnitType.MILLILITER }
  ): Promise<{
    actual: NutritionFacts & { mealCount: number; waterMl: number };
    goal: UserGoals;
    achievement: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      water: number;
    };
    isExceeded: {
      calories: boolean;
      protein: boolean;
      carbs: boolean;
      fat: boolean;
    };
  }> {
    const actual = await this.calculateDailySummary(meals, waterIntake);

    let waterMlGoal = goals.dailyWater;
    if (goals.waterUnit === UnitType.LITER) {
      waterMlGoal = goals.dailyWater * 1000;
    }

    const achievement = {
      calories: goals.dailyCalories > 0 ? roundTo((actual.calories / goals.dailyCalories) * 100, 1) : 0,
      protein: goals.dailyProtein > 0 ? roundTo((actual.protein / goals.dailyProtein) * 100, 1) : 0,
      carbs: goals.dailyCarbs > 0 ? roundTo((actual.carbs / goals.dailyCarbs) * 100, 1) : 0,
      fat: goals.dailyFat > 0 ? roundTo((actual.fat / goals.dailyFat) * 100, 1) : 0,
      water: waterMlGoal > 0 ? roundTo((actual.waterMl / waterMlGoal) * 100, 1) : 0,
    };

    const isExceeded = {
      calories: actual.calories > goals.dailyCalories,
      protein: actual.protein > goals.dailyProtein,
      carbs: actual.carbs > goals.dailyCarbs,
      fat: actual.fat > goals.dailyFat,
    };

    return { actual, goal: goals, achievement, isExceeded };
  }

  async calculateMacronutrientRatio(
    nutrition: NutritionFacts
  ): Promise<{ protein: number; carbs: number; fat: number; proteinGrams: number; carbsGrams: number; fatGrams: number }> {
    const proteinCalories = nutrition.protein * 4;
    const carbsCalories = nutrition.carbs * 4;
    const fatCalories = nutrition.fat * 9;
    const totalCalories = proteinCalories + carbsCalories + fatCalories;

    if (totalCalories === 0) {
      return { protein: 0, carbs: 0, fat: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 };
    }

    return {
      protein: roundTo((proteinCalories / totalCalories) * 100, 1),
      carbs: roundTo((carbsCalories / totalCalories) * 100, 1),
      fat: roundTo((fatCalories / totalCalories) * 100, 1),
      proteinGrams: roundTo(nutrition.protein, 1),
      carbsGrams: roundTo(nutrition.carbs, 1),
      fatGrams: roundTo(nutrition.fat, 1),
    };
  }

  async calculateNutrientGaps(
    actual: NutritionFacts,
    goals: UserGoals
  ): Promise<NutrientGap[]> {
    const gaps: NutrientGap[] = [];
    const nutrientMap: Array<{ key: keyof NutritionFacts; target: number; suggestion: string }> = [
      { key: 'protein', target: goals.dailyProtein, suggestion: '建议增加高蛋白食物，如鸡胸肉、鱼类、豆类' },
      { key: 'carbs', target: goals.dailyCarbs, suggestion: '建议增加复合碳水化合物，如全谷物、红薯' },
      { key: 'fat', target: goals.dailyFat, suggestion: '建议增加健康脂肪，如坚果、牛油果、橄榄油' },
      { key: 'fiber', target: 25, suggestion: '建议增加膳食纤维，如蔬菜、水果、全谷物' },
      { key: 'iron', target: 15, suggestion: '建议增加铁质食物，如红肉、菠菜、豆类' },
      { key: 'calcium', target: 1000, suggestion: '建议增加钙质食物，如牛奶、豆制品、深绿色蔬菜' },
    ];

    for (const { key, target, suggestion } of nutrientMap) {
      const current = actual[key] || 0;
      const gap = target - current;
      const percentage = target > 0 ? roundTo((current / target) * 100, 1) : 0;

      if (percentage < 80) {
        gaps.push({
          nutrient: key,
          current: roundTo(current, 1),
          target,
          gap: roundTo(gap, 1),
          percentage,
          suggestion,
        });
      }
    }

    return gaps.sort((a, b) => a.percentage - b.percentage);
  }

  async getCheckInStatus(
    mealRecords: MealRecord[],
    targetMealsPerDay: number = 3
  ): Promise<CheckInStatus> {
    const today = getTimestamp();
    const checkInDates = new Set<number>();

    for (const meal of mealRecords) {
      const dayStart = getStartOfDay(meal.timestamp);
      checkInDates.add(dayStart);
    }

    const todayStart = getStartOfDay(today);
    const todayMeals = mealRecords.filter(m => isSameDay(m.timestamp, today));
    const todayChecked = todayMeals.length >= targetMealsPerDay;

    const sortedDates = Array.from(checkInDates).sort((a, b) => b - a);

    let currentStreak = 0;
    let checkDate = todayStart;

    for (const date of sortedDates) {
      if (isSameDay(date, checkDate)) {
        currentStreak++;
        checkDate = checkDate - 24 * 60 * 60 * 1000;
      } else if (date < checkDate) {
        break;
      }
    }

    let longestStreak = 0;
    let tempStreak = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const diff = getDaysDiff(sortedDates[i], sortedDates[i - 1]);
      if (diff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    return {
      todayChecked,
      currentStreak,
      longestStreak,
      totalCheckIns: checkInDates.size,
      checkInDates: sortedDates,
    };
  }

  async analyzeTrends(
    dailySummaries: DailySummary[],
    daysToCompare: number = 7
  ): Promise<TrendAnalysis[]> {
    if (dailySummaries.length < 2) return [];

    const recent = dailySummaries.slice(0, daysToCompare);
    const previous = dailySummaries.slice(daysToCompare, daysToCompare * 2);

    const nutrients: Array<{ key: keyof DailySummary; label: string }> = [
      { key: 'calories', label: '热量' },
      { key: 'protein', label: '蛋白质' },
      { key: 'carbs', label: '碳水化合物' },
      { key: 'fat', label: '脂肪' },
      { key: 'waterMl', label: '饮水' },
    ];

    const trends: TrendAnalysis[] = [];

    for (const { key, label } of nutrients) {
      const recentValues = recent.map(d => d[key] as number);
      const previousValues = previous.map(d => d[key] as number);

      if (recentValues.length === 0) continue;

      const current = recentValues[0];
      const recentAvg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      const previousAvg = previousValues.length > 0
        ? previousValues.reduce((a, b) => a + b, 0) / previousValues.length
        : recentAvg;

      const changePercent = previousAvg > 0
        ? roundTo(((recentAvg - previousAvg) / previousAvg) * 100, 1)
        : 0;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (Math.abs(changePercent) > 10) {
        trend = changePercent > 0 ? 'up' : 'down';
      }

      trends.push({
        nutrient: label,
        current: roundTo(current, 1),
        average: roundTo(recentAvg, 1),
        trend,
        changePercent,
      });
    }

    return trends;
  }

  async generateNutritionReport(
    dailySummaries: DailySummary[],
    goals: UserGoals
  ): Promise<{
    periodSummary: {
      totalDays: number;
      averageCalories: number;
      averageProtein: number;
      averageCarbs: number;
      averageFat: number;
      averageWaterMl: number;
    };
    goalAchievement: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      water: number;
    };
    bestDay: { date: number; score: number };
    worstDay: { date: number; score: number };
    recommendations: string[];
  }> {
    const totalDays = dailySummaries.length;

    const avgNutrition = averageNutrition(
      dailySummaries.map(d => ({
        calories: d.calories,
        protein: d.protein,
        carbs: d.carbs,
        fat: d.fat,
      }))
    );

    const avgWater = dailySummaries.reduce((acc, d) => acc + d.waterMl, 0) / totalDays;

    let waterMlGoal = goals.dailyWater;
    if (goals.waterUnit === UnitType.LITER) {
      waterMlGoal = goals.dailyWater * 1000;
    }

    const goalAchievement = {
      calories: goals.dailyCalories > 0 ? roundTo((avgNutrition.calories / goals.dailyCalories) * 100, 1) : 0,
      protein: goals.dailyProtein > 0 ? roundTo((avgNutrition.protein / goals.dailyProtein) * 100, 1) : 0,
      carbs: goals.dailyCarbs > 0 ? roundTo((avgNutrition.carbs / goals.dailyCarbs) * 100, 1) : 0,
      fat: goals.dailyFat > 0 ? roundTo((avgNutrition.fat / goals.dailyFat) * 100, 1) : 0,
      water: waterMlGoal > 0 ? roundTo((avgWater / waterMlGoal) * 100, 1) : 0,
    };

    const scoredDays = dailySummaries.map(d => {
      const calorieScore = goals.dailyCalories > 0
        ? 100 - Math.abs((d.calories / goals.dailyCalories) - 1) * 100
        : 50;
      const waterScore = waterMlGoal > 0
        ? Math.min(100, (d.waterMl / waterMlGoal) * 100)
        : 50;
      const mealScore = Math.min(100, (d.mealCount / goals.mealFrequency) * 100);
      return {
        date: d.date,
        score: roundTo((calorieScore + waterScore + mealScore) / 3, 1),
      };
    });

    const bestDay = scoredDays.reduce((best, d) => d.score > best.score ? d : best, scoredDays[0]);
    const worstDay = scoredDays.reduce((worst, d) => d.score < worst.score ? d : worst, scoredDays[0]);

    const recommendations: string[] = [];

    if (goalAchievement.calories < 80) {
      recommendations.push('热量摄入偏低，建议适当增加食物量');
    } else if (goalAchievement.calories > 110) {
      recommendations.push('热量摄入偏高，建议控制食物量');
    }

    if (goalAchievement.protein < 80) {
      recommendations.push('蛋白质摄入不足，建议增加肉类、鱼类、豆类等高蛋白食物');
    }

    if (goalAchievement.water < 80) {
      recommendations.push('饮水不足，建议每天喝够8杯水');
    }

    const avgMeals = dailySummaries.reduce((acc, d) => acc + d.mealCount, 0) / totalDays;
    if (avgMeals < goals.mealFrequency) {
      recommendations.push(`建议规律饮食，每天保持${goals.mealFrequency}餐`);
    }

    return {
      periodSummary: {
        totalDays,
        averageCalories: roundTo(avgNutrition.calories, 1),
        averageProtein: roundTo(avgNutrition.protein, 1),
        averageCarbs: roundTo(avgNutrition.carbs, 1),
        averageFat: roundTo(avgNutrition.fat, 1),
        averageWaterMl: roundTo(avgWater, 1),
      },
      goalAchievement,
      bestDay,
      worstDay,
      recommendations,
    };
  }

  async getMealDistribution(meals: MealRecord[]): Promise<Record<MealType, NutritionFacts & { count: number }>> {
    const distribution: Record<MealType, NutritionFacts & { count: number }> = {
      [MealType.BREAKFAST]: { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
      [MealType.LUNCH]: { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
      [MealType.DINNER]: { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
      [MealType.SNACK]: { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 },
    };

    for (const meal of meals) {
      const type = meal.mealType;
      distribution[type].calories += meal.totalNutrition.calories;
      distribution[type].protein += meal.totalNutrition.protein;
      distribution[type].carbs += meal.totalNutrition.carbs;
      distribution[type].fat += meal.totalNutrition.fat;
      distribution[type].count++;
    }

    return distribution;
  }
}
