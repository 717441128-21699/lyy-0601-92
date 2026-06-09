import {
  WeeklyReport,
  MealRecord,
  WeightRecord,
  UserGoals,
  UserProfile,
  SDKConfig,
  MealType,
  UnitType,
} from '../types';
import {
  getTimestamp,
  getStartOfDay,
  getEndOfDay,
  sumNutrition,
  averageNutrition,
  roundTo,
  isSameDay,
  getDaysDiff,
  convertUnit,
  formatDate,
} from '../utils/helpers';

interface MonthlyReport {
  userId: string;
  startDate: number;
  endDate: number;
  averageDailyCalories: number;
  averageDailyNutrition: any;
  calorieGoalAchievement: number;
  weightTrend: number[];
  weightChange: number;
  checkInDays: number;
  checkInStreak: number;
  summary: string;
  suggestions: string[];
}

export class ReportGenerationManager {
  private config: SDKConfig;

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async generateWeeklyReport(
    userId: string,
    profile: UserProfile,
    goals: UserGoals,
    meals: MealRecord[],
    weightRecords: WeightRecord[],
    waterRecords: { date: number; amount: number; unit: UnitType }[],
    weekOffset: number = 0
  ): Promise<WeeklyReport> {
    const now = getTimestamp();
    const weekEnd = getEndOfDay(now - weekOffset * 7 * 24 * 60 * 60 * 1000);
    const weekStart = getStartOfDay(weekEnd - 6 * 24 * 60 * 60 * 1000);

    const weekMeals = meals.filter(m => m.timestamp >= weekStart && m.timestamp <= weekEnd);
    const weekWeights = weightRecords.filter(w => w.timestamp >= weekStart && w.timestamp <= weekEnd);
    const weekWater = waterRecords.filter(w => w.date >= weekStart && w.date <= weekEnd);

    const dailyNutrition = await this.calculateDailyNutrition(weekMeals, weekStart, weekEnd);
    const dailyWater = this.calculateDailyWater(weekWater, weekStart, weekEnd);

    const avgNutrition = averageNutrition(dailyNutrition);
    const avgWater = dailyWater.reduce((acc, w) => acc + w.amount, 0) / dailyWater.length;

    const mealFrequency = this.calculateMealFrequency(weekMeals);
    const topFoods = this.calculateTopFoods(weekMeals, 10);

    const checkInStatus = this.calculateCheckInStatus(weekMeals, weekStart, weekEnd);
    const weightTrend = this.calculateWeightTrend(weekWeights, weekStart, weekEnd);
    const weightChange = this.calculateWeightChange(weekWeights);
    const nutrientGaps = this.calculateNutrientGaps(avgNutrition, goals);
    const abnormalFluctuations = this.detectAbnormalFluctuations(weightRecords, weekStart, weekEnd);
    const missedMeals = this.calculateMissedMeals(weekMeals, goals.mealFrequency, weekStart, weekEnd);

    const weeklySummary = this.generateWeeklySummary(
      avgNutrition,
      goals,
      weightChange,
      checkInStatus.checkInDays
    );

    const suggestions = this.generateSuggestions(
      avgNutrition,
      goals,
      avgWater,
      weightChange,
      nutrientGaps,
      missedMeals
    );

    let waterMlGoal = goals.dailyWater;
    if (goals.waterUnit === UnitType.LITER) {
      waterMlGoal = goals.dailyWater * 1000;
    }

    return {
      userId,
      startDate: weekStart,
      endDate: weekEnd,
      averageDailyCalories: roundTo(avgNutrition.calories, 1),
      averageDailyNutrition: avgNutrition,
      calorieGoalAchievement: goals.dailyCalories > 0
        ? roundTo((avgNutrition.calories / goals.dailyCalories) * 100, 1)
        : 0,
      proteinGoalAchievement: goals.dailyProtein > 0
        ? roundTo((avgNutrition.protein / goals.dailyProtein) * 100, 1)
        : 0,
      carbsGoalAchievement: goals.dailyCarbs > 0
        ? roundTo((avgNutrition.carbs / goals.dailyCarbs) * 100, 1)
        : 0,
      fatGoalAchievement: goals.dailyFat > 0
        ? roundTo((avgNutrition.fat / goals.dailyFat) * 100, 1)
        : 0,
      waterIntakeAverage: roundTo(avgWater, 1),
      waterGoalAchievement: waterMlGoal > 0
        ? roundTo((avgWater / waterMlGoal) * 100, 1)
        : 0,
      weightTrend,
      weightChange: roundTo(weightChange, 2),
      mealFrequency,
      topFoods,
      checkInDays: checkInStatus.checkInDays,
      checkInStreak: checkInStatus.currentStreak,
      missedMeals,
      nutrientGaps,
      abnormalFluctuations,
      weeklySummary,
      suggestions,
    };
  }

  private async calculateDailyNutrition(
    meals: MealRecord[],
    startDate: number,
    endDate: number
  ): Promise<any[]> {
    const dailyNutrition: any[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = startDate; day <= endDate; day += dayMs) {
      const dayEnd = getEndOfDay(day);
      const dayMeals = meals.filter(m => m.timestamp >= day && m.timestamp <= dayEnd);
      const nutrition = dayMeals.length > 0
        ? sumNutrition(dayMeals.map(m => m.totalNutrition))
        : { calories: 0, protein: 0, carbs: 0, fat: 0 };

      dailyNutrition.push({
        date: day,
        ...nutrition,
      });
    }

    return dailyNutrition;
  }

  private calculateDailyWater(
    waterRecords: { date: number; amount: number; unit: UnitType }[],
    startDate: number,
    endDate: number
  ): Array<{ date: number; amount: number }> {
    const dailyWater: Array<{ date: number; amount: number }> = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = startDate; day <= endDate; day += dayMs) {
      const dayEnd = getEndOfDay(day);
      const dayRecords = waterRecords.filter(w => w.date >= day && w.date <= dayEnd);

      let totalMl = 0;
      for (const record of dayRecords) {
        let amountMl = record.amount;
        if (record.unit === UnitType.LITER) {
          amountMl = record.amount * 1000;
        } else if (record.unit === UnitType.CUP) {
          amountMl = record.amount * 240;
        }
        totalMl += amountMl;
      }

      dailyWater.push({ date: day, amount: totalMl });
    }

    return dailyWater;
  }

  private calculateMealFrequency(meals: MealRecord[]): Record<MealType, number> {
    const frequency: Record<MealType, number> = {
      [MealType.BREAKFAST]: 0,
      [MealType.LUNCH]: 0,
      [MealType.DINNER]: 0,
      [MealType.SNACK]: 0,
    };

    for (const meal of meals) {
      frequency[meal.mealType]++;
    }

    return frequency;
  }

  private calculateTopFoods(meals: MealRecord[], limit: number): Array<{ name: string; count: number }> {
    const foodCount = new Map<string, { name: string; count: number }>();

    for (const meal of meals) {
      for (const food of meal.foods) {
        const existing = foodCount.get(food.foodId);
        if (existing) {
          existing.count++;
        } else {
          foodCount.set(food.foodId, { name: food.foodName, count: 1 });
        }
      }
    }

    return Array.from(foodCount.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private calculateCheckInStatus(
    meals: MealRecord[],
    startDate: number,
    endDate: number
  ): { checkInDays: number; currentStreak: number; longestStreak: number } {
    const checkInDays = new Set<number>();

    for (const meal of meals) {
      if (meal.timestamp >= startDate && meal.timestamp <= endDate) {
        checkInDays.add(getStartOfDay(meal.timestamp));
      }
    }

    const sortedDates = Array.from(checkInDays).sort((a, b) => b - a);

    let currentStreak = 0;
    let checkDate = getStartOfDay(endDate);

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
      checkInDays: checkInDays.size,
      currentStreak,
      longestStreak,
    };
  }

  private calculateWeightTrend(
    weightRecords: WeightRecord[],
    startDate: number,
    endDate: number
  ): number[] {
    const trend: number[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = startDate; day <= endDate; day += dayMs) {
      const dayEnd = getEndOfDay(day);
      const dayRecords = weightRecords.filter(w => w.timestamp >= day && w.timestamp <= dayEnd);

      if (dayRecords.length > 0) {
        const avgWeight = dayRecords.reduce((acc, w) => acc + w.weight, 0) / dayRecords.length;
        trend.push(roundTo(avgWeight, 2));
      } else {
        trend.push(0);
      }
    }

    return trend;
  }

  private calculateWeightChange(weightRecords: WeightRecord[]): number {
    if (weightRecords.length < 2) return 0;

    const sorted = [...weightRecords].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let firstKg = first.weight;
    let lastKg = last.weight;

    if (first.unit === UnitType.POUND) {
      firstKg = convertUnit(first.weight, UnitType.POUND, UnitType.KILOGRAM);
    }
    if (last.unit === UnitType.POUND) {
      lastKg = convertUnit(last.weight, UnitType.POUND, UnitType.KILOGRAM);
    }

    return lastKg - firstKg;
  }

  private calculateNutrientGaps(
    avgNutrition: any,
    goals: UserGoals
  ): Array<{ nutrient: string; gap: number; suggestion: string }> {
    const gaps: Array<{ nutrient: string; gap: number; suggestion: string }> = [];

    const nutrientMap = [
      { key: 'protein', target: goals.dailyProtein, name: '蛋白质', suggestion: '建议增加鸡胸肉、鱼类、豆类等高蛋白食物' },
      { key: 'fiber', target: 25, name: '膳食纤维', suggestion: '建议增加蔬菜、水果、全谷物等富含纤维的食物' },
      { key: 'iron', target: 15, name: '铁', suggestion: '建议增加红肉、菠菜、豆类等富含铁质的食物' },
      { key: 'calcium', target: 1000, name: '钙', suggestion: '建议增加牛奶、豆制品、深绿色蔬菜等富含钙质的食物' },
    ];

    for (const { key, target, name, suggestion } of nutrientMap) {
      const current = avgNutrition[key] || 0;
      const percentage = target > 0 ? (current / target) * 100 : 100;

      if (percentage < 80) {
        gaps.push({
          nutrient: name,
          gap: roundTo(target - current, 1),
          suggestion,
        });
      }
    }

    return gaps;
  }

  private detectAbnormalFluctuations(
    weightRecords: WeightRecord[],
    startDate: number,
    endDate: number
  ): Array<{ date: number; weightChange: number; description: string }> {
    const fluctuations: Array<{ date: number; weightChange: number; description: string }> = [];

    const sortedRecords = weightRecords
      .filter(w => w.timestamp >= startDate - 7 * 24 * 60 * 60 * 1000 && w.timestamp <= endDate)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedRecords.length; i++) {
      const prev = sortedRecords[i - 1];
      const curr = sortedRecords[i];

      let prevKg = prev.weight;
      let currKg = curr.weight;

      if (prev.unit === UnitType.POUND) {
        prevKg = convertUnit(prev.weight, UnitType.POUND, UnitType.KILOGRAM);
      }
      if (curr.unit === UnitType.POUND) {
        currKg = convertUnit(curr.weight, UnitType.POUND, UnitType.KILOGRAM);
      }

      const change = currKg - prevKg;
      const daysDiff = getDaysDiff(curr.timestamp, prev.timestamp);
      const dailyChange = change / Math.max(daysDiff, 1);

      if (Math.abs(dailyChange) > 0.5) {
        let description = '';
        if (dailyChange > 0.5) {
          description = `体重快速增加${roundTo(Math.abs(change), 2)}kg，可能是水分滞留或饮食变化`;
        } else {
          description = `体重快速下降${roundTo(Math.abs(change), 2)}kg，建议关注是否有健康问题`;
        }

        if (curr.timestamp >= startDate) {
          fluctuations.push({
            date: curr.timestamp,
            weightChange: roundTo(change, 2),
            description,
          });
        }
      }
    }

    return fluctuations;
  }

  private calculateMissedMeals(
    meals: MealRecord[],
    expectedMealsPerDay: number,
    startDate: number,
    endDate: number
  ): number {
    const dayMs = 24 * 60 * 60 * 1000;
    let missedMeals = 0;

    for (let day = startDate; day <= endDate; day += dayMs) {
      const dayEnd = getEndOfDay(day);
      const dayMeals = meals.filter(m => m.timestamp >= day && m.timestamp <= dayEnd);
      missedMeals += Math.max(0, expectedMealsPerDay - dayMeals.length);
    }

    return missedMeals;
  }

  private generateWeeklySummary(
    avgNutrition: any,
    goals: UserGoals,
    weightChange: number,
    checkInDays: number
  ): string {
    const caloriePercent = goals.dailyCalories > 0
      ? roundTo((avgNutrition.calories / goals.dailyCalories) * 100, 0)
      : 0;

    let calorieStatus = '';
    if (caloriePercent < 80) {
      calorieStatus = '热量摄入偏低';
    } else if (caloriePercent > 120) {
      calorieStatus = '热量摄入偏高';
    } else {
      calorieStatus = '热量摄入适中';
    }

    let weightStatus = '';
    if (weightChange < -0.5) {
      weightStatus = `减重${roundTo(Math.abs(weightChange), 1)}kg，进展良好`;
    } else if (weightChange > 0.5) {
      weightStatus = `增重${roundTo(weightChange, 1)}kg，需注意控制`;
    } else {
      weightStatus = '体重基本稳定';
    }

    return `本周共打卡${checkInDays}天，${calorieStatus}，${weightStatus}。继续保持良好的饮食习惯！`;
  }

  private generateSuggestions(
    avgNutrition: any,
    goals: UserGoals,
    avgWater: number,
    weightChange: number,
    nutrientGaps: Array<{ nutrient: string; gap: number; suggestion: string }>,
    missedMeals: number
  ): string[] {
    const suggestions: string[] = [];

    const caloriePercent = goals.dailyCalories > 0
      ? (avgNutrition.calories / goals.dailyCalories) * 100
      : 100;

    if (caloriePercent < 80) {
      suggestions.push('热量摄入不足，建议适当增加每餐的食物量');
    } else if (caloriePercent > 110) {
      suggestions.push('热量摄入超标，建议控制每餐分量，减少高热量零食');
    }

    const proteinPercent = goals.dailyProtein > 0
      ? (avgNutrition.protein / goals.dailyProtein) * 100
      : 100;

    if (proteinPercent < 80) {
      suggestions.push('蛋白质摄入不足，建议增加鸡胸肉、鱼类、豆类等高蛋白食物');
    }

    let waterMlGoal = goals.dailyWater;
    if (goals.waterUnit === UnitType.LITER) {
      waterMlGoal = goals.dailyWater * 1000;
    }
    const waterPercent = waterMlGoal > 0 ? (avgWater / waterMlGoal) * 100 : 100;

    if (waterPercent < 80) {
      suggestions.push('饮水不足，建议每天喝够8杯水，每次200-250ml');
    }

    if (missedMeals > 0) {
      suggestions.push(`本周有${missedMeals}餐未记录，建议规律饮食，按时记录`);
    }

    for (const gap of nutrientGaps) {
      suggestions.push(gap.suggestion);
    }

    if (weightChange > 0.3 && goals.dailyCalories < avgNutrition.calories) {
      suggestions.push('体重有所增加，建议增加运动量或适当减少热量摄入');
    }

    if (suggestions.length === 0) {
      suggestions.push('各项指标表现良好，继续保持健康的生活方式！');
    }

    return suggestions.slice(0, 5);
  }

  async generateMonthlyReport(
    userId: string,
    profile: UserProfile,
    goals: UserGoals,
    meals: MealRecord[],
    weightRecords: WeightRecord[],
    waterRecords: { date: number; amount: number; unit: UnitType }[]
  ): Promise<MonthlyReport> {
    const now = getTimestamp();
    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const monthEnd = getEndOfDay(now);

    const monthMeals = meals.filter(m => m.timestamp >= monthStart && m.timestamp <= monthEnd);
    const monthWeights = weightRecords.filter(w => w.timestamp >= monthStart && w.timestamp <= monthEnd);

    const dailyNutrition = await this.calculateDailyNutrition(monthMeals, monthStart, monthEnd);
    const avgNutrition = averageNutrition(dailyNutrition);
    const weightTrend = this.calculateWeightTrend(monthWeights, monthStart, monthEnd);
    const weightChange = this.calculateWeightChange(monthWeights);
    const checkInStatus = this.calculateCheckInStatus(monthMeals, monthStart, monthEnd);

    const summary = `本月共打卡${checkInStatus.checkInDays}天，平均每日摄入${roundTo(avgNutrition.calories, 0)}大卡，体重变化${weightChange >= 0 ? '+' : ''}${roundTo(weightChange, 1)}kg。`;

    const suggestions = this.generateMonthlySuggestions(avgNutrition, goals, weightChange, checkInStatus);

    return {
      userId,
      startDate: monthStart,
      endDate: monthEnd,
      averageDailyCalories: roundTo(avgNutrition.calories, 1),
      averageDailyNutrition: avgNutrition,
      calorieGoalAchievement: goals.dailyCalories > 0
        ? roundTo((avgNutrition.calories / goals.dailyCalories) * 100, 1)
        : 0,
      weightTrend: weightTrend.filter(w => w > 0),
      weightChange: roundTo(weightChange, 2),
      checkInDays: checkInStatus.checkInDays,
      checkInStreak: checkInStatus.currentStreak,
      summary,
      suggestions,
    };
  }

  private generateMonthlySuggestions(
    avgNutrition: any,
    goals: UserGoals,
    weightChange: number,
    checkInStatus: { checkInDays: number; currentStreak: number; longestStreak: number }
  ): string[] {
    const suggestions: string[] = [];

    const caloriePercent = goals.dailyCalories > 0
      ? (avgNutrition.calories / goals.dailyCalories) * 100
      : 100;

    if (Math.abs(caloriePercent - 100) > 15) {
      if (caloriePercent < 85) {
        suggestions.push('本月热量摄入普遍偏低，建议增加食物摄入量');
      } else {
        suggestions.push('本月热量摄入普遍偏高，建议控制饮食');
      }
    } else {
      suggestions.push('本月热量控制良好，继续保持');
    }

    if (weightChange < -1) {
      suggestions.push('本月减重效果显著，注意保持营养均衡');
    } else if (weightChange > 1) {
      suggestions.push('本月体重有所增加，建议调整饮食结构');
    }

    if (checkInStatus.currentStreak >= 7) {
      suggestions.push(`太棒了！已连续打卡${checkInStatus.currentStreak}天，继续保持！`);
    }

    if (checkInStatus.longestStreak >= 14) {
      suggestions.push(`最长连续打卡${checkInStatus.longestStreak}天，非常有毅力！`);
    }

    return suggestions;
  }

  async exportReport(report: WeeklyReport | MonthlyReport, format: 'json' | 'text' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    const lines: string[] = [];
    lines.push('=== 健康报告 ===');
    lines.push(`周期: ${formatDate(report.startDate)} - ${formatDate(report.endDate)}`);
    lines.push(`平均每日热量: ${report.averageDailyCalories} 大卡`);
    lines.push(`热量目标达成: ${report.calorieGoalAchievement}%`);
    lines.push(`体重变化: ${report.weightChange >= 0 ? '+' : ''}${report.weightChange} kg`);
    lines.push(`打卡天数: ${report.checkInDays} 天`);
    lines.push(`连续打卡: ${report.checkInStreak} 天`);

    if ('weeklySummary' in report) {
      lines.push('');
      lines.push('周总结: ' + report.weeklySummary);
    }

    if ('suggestions' in report) {
      lines.push('');
      lines.push('建议:');
      for (const [i, suggestion] of report.suggestions.entries()) {
        lines.push(`${i + 1}. ${suggestion}`);
      }
    }

    return lines.join('\n');
  }

  async generateComparisonReport(
    currentReport: WeeklyReport,
    previousReport: WeeklyReport
  ): Promise<{
    calorieChange: number;
    weightChange: number;
    checkInChange: number;
    improvements: string[];
    areasToImprove: string[];
  }> {
    const calorieChange = roundTo(
      currentReport.averageDailyCalories - previousReport.averageDailyCalories,
      1
    );

    const weightChange = roundTo(
      currentReport.weightChange - previousReport.weightChange,
      2
    );

    const checkInChange = currentReport.checkInDays - previousReport.checkInDays;

    const improvements: string[] = [];
    const areasToImprove: string[] = [];

    if (currentReport.calorieGoalAchievement >= previousReport.calorieGoalAchievement) {
      improvements.push('热量控制比上周更好');
    } else {
      areasToImprove.push('热量控制需要加强');
    }

    if (currentReport.checkInDays >= previousReport.checkInDays) {
      improvements.push('打卡天数比上周增加');
    } else {
      areasToImprove.push('打卡天数比上周减少');
    }

    if (Math.abs(currentReport.weightChange) < Math.abs(previousReport.weightChange)) {
      improvements.push('体重变化更趋于稳定');
    }

    return {
      calorieChange,
      weightChange,
      checkInChange,
      improvements,
      areasToImprove,
    };
  }
}
