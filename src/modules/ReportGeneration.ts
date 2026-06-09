import {
  WeeklyReport,
  MealRecord,
  WeightRecord,
  WaterRecord,
  UserGoals,
  UserProfile,
  SDKConfig,
  MealType,
  UnitType,
  DietGoal,
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
  normalizeVolumeToMl,
  normalizeWeightToKg,
  desensitizeWeeklyReport,
  desensitizeReport,
} from '../utils/helpers';
import type { DesensitizeOptions, MonthlyReport, TrendAnalysis, TrendComparison } from '../types';

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
    const dailyCheckInDetails = this.calculateDailyCheckInDetails(weekMeals, weekStart, weekEnd, goals.mealFrequency);

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
      dailyCheckInDetails,
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
    waterRecords: { date: number; amount: number; unit: UnitType; normalizedAmountMl?: number }[],
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
        totalMl += record.normalizedAmountMl !== undefined 
          ? record.normalizedAmountMl 
          : normalizeVolumeToMl(record.amount, record.unit);
      }

      dailyWater.push({ date: day, amount: totalMl > 0 ? roundTo(totalMl, 2) : 0 });
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
        const avgWeight = dayRecords.reduce((acc, w) => acc + (w.normalizedWeightKg || normalizeWeightToKg(w.weight, w.unit)), 0) / dayRecords.length;
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

    const firstKg = first.normalizedWeightKg || normalizeWeightToKg(first.weight, first.unit);
    const lastKg = last.normalizedWeightKg || normalizeWeightToKg(last.weight, last.unit);

    return roundTo(lastKg - firstKg, 2);
  }

  private calculateNutrientGaps(
    avgNutrition: any,
    goals: UserGoals
  ): Array<{ nutrient: string; gap: number; suggestion: string; percentage: number }> {
    const gaps: Array<{ nutrient: string; gap: number; suggestion: string; percentage: number }> = [];

    const nutrientMap = [
      { key: 'protein', target: goals.dailyProtein, name: '蛋白质', suggestion: '建议增加鸡胸肉、鱼类、豆类等高蛋白食物' },
      { key: 'fiber', target: 25, name: '膳食纤维', suggestion: '建议增加蔬菜、水果、全谷物等富含纤维的食物' },
      { key: 'iron', target: 15, name: '铁', suggestion: '建议增加红肉、菠菜、豆类等富含铁质的食物' },
      { key: 'calcium', target: 1000, name: '钙', suggestion: '建议增加牛奶、豆制品、深绿色蔬菜等富含钙质的食物' },
    ];

    for (const { key, target, name, suggestion } of nutrientMap) {
      const current = avgNutrition[key] || 0;
      const percentage = target > 0 ? roundTo((current / target) * 100, 1) : 0;

      if (percentage < 80) {
        gaps.push({
          nutrient: name,
          gap: roundTo(target - current, 1),
          suggestion,
          percentage,
        });
      }
    }

    return gaps;
  }

  private calculateDailyCheckInDetails(
    meals: MealRecord[],
    startDate: number,
    endDate: number,
    targetMealsPerDay: number
  ): Array<import('../types').DailyCheckInDetail> {
    const details: Array<import('../types').DailyCheckInDetail> = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let day = startDate; day <= endDate; day += dayMs) {
      const dayEnd = getEndOfDay(day);
      const dayMeals = meals.filter(m => m.timestamp >= day && m.timestamp <= dayEnd);
      const mealCount = dayMeals.length;
      
      let status: 'empty' | 'partial' | 'complete' = 'empty';
      let description = '';

      if (mealCount === 0) {
        status = 'empty';
        description = '今日未记录任何餐次';
      } else if (mealCount < targetMealsPerDay) {
        status = 'partial';
        description = `今日记录${mealCount}餐，目标${targetMealsPerDay}餐，还差${targetMealsPerDay - mealCount}餐`;
      } else {
        status = 'complete';
        description = `今日记录${mealCount}餐，已完成目标${targetMealsPerDay}餐`;
      }

      details.push({
        date: day,
        mealCount,
        targetMeals: targetMealsPerDay,
        status,
        description,
      });
    }

    return details;
  }

  private detectAbnormalFluctuations(
    weightRecords: WeightRecord[],
    startDate: number,
    endDate: number
  ): Array<{ date: number; weightChange: number; description: string; possibleReasons: string[] }> {
    const fluctuations: Array<{ date: number; weightChange: number; description: string; possibleReasons: string[] }> = [];

    const sortedRecords = weightRecords
      .filter(w => w.timestamp >= startDate - 7 * 24 * 60 * 60 * 1000 && w.timestamp <= endDate)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedRecords.length; i++) {
      const prev = sortedRecords[i - 1];
      const curr = sortedRecords[i];

      const prevKg = prev.normalizedWeightKg || normalizeWeightToKg(prev.weight, prev.unit);
      const currKg = curr.normalizedWeightKg || normalizeWeightToKg(curr.weight, curr.unit);

      const change = currKg - prevKg;
      const daysDiff = getDaysDiff(curr.timestamp, prev.timestamp);
      const dailyChange = change / Math.max(daysDiff, 1);

      if (Math.abs(dailyChange) > 0.5) {
        let description = '';
        let possibleReasons: string[] = [];
        
        if (dailyChange > 0.5) {
          description = `体重在${daysDiff}天内快速增加${roundTo(Math.abs(change), 2)}kg（日均${roundTo(Math.abs(dailyChange), 2)}kg）`;
          possibleReasons = [
            '饮食量突然增加',
            '盐分摄入过多导致水分滞留',
            '生理期水肿（女性）',
            '运动量明显减少',
            '药物副作用',
            '甲状腺功能变化'
          ];
        } else {
          description = `体重在${daysDiff}天内快速下降${roundTo(Math.abs(change), 2)}kg（日均${roundTo(Math.abs(dailyChange), 2)}kg）`;
          possibleReasons = [
            '饮食量大幅减少',
            '运动量突然增加',
            '腹泻或呕吐',
            '压力过大或焦虑',
            '甲状腺功能亢进',
            '糖尿病等代谢疾病'
          ];
        }

        if (curr.timestamp >= startDate) {
          fluctuations.push({
            date: curr.timestamp,
            weightChange: roundTo(change, 2),
            description,
            possibleReasons,
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

  async exportReport(
    report: WeeklyReport | MonthlyReport, 
    format: 'json' | 'text' = 'json',
    desensitizeOptions?: DesensitizeOptions
  ): Promise<string> {
    const finalReport = desensitizeOptions 
      ? desensitizeReport(report, desensitizeOptions) 
      : report;

    if (format === 'json') {
      return JSON.stringify(finalReport, null, 2);
    }

    let lines: string[] = [];
    lines.push('=== 健康报告 ===');
    lines.push(`周期: ${formatDate(finalReport.startDate)} - ${formatDate(finalReport.endDate)}`);
    lines.push(`平均每日热量: ${finalReport.averageDailyCalories} 大卡`);
    lines.push(`热量目标达成: ${finalReport.calorieGoalAchievement}%`);
    lines.push(`体重变化: ${finalReport.weightChange >= 0 ? '+' : ''}${finalReport.weightChange} kg`);
    lines.push(`打卡天数: ${finalReport.checkInDays} 天`);
    lines.push(`连续打卡: ${finalReport.checkInStreak} 天`);

    if ('weeklySummary' in finalReport) {
      lines.push('');
      lines.push('周总结: ' + finalReport.weeklySummary);
    }

    if ('summary' in finalReport) {
      lines.push('');
      lines.push('月总结: ' + (finalReport as MonthlyReport).summary);
    }

    if ('suggestions' in finalReport) {
      lines.push('');
      lines.push('建议:');
      for (const [i, suggestion] of finalReport.suggestions.entries()) {
        lines.push(`${i + 1}. ${suggestion}`);
      }
    }

    if ('abnormalFluctuations' in finalReport && finalReport.abnormalFluctuations) {
      lines.push('');
      lines.push('异常波动:');
      for (const fluctuation of finalReport.abnormalFluctuations) {
        lines.push(`- ${fluctuation.description}`);
      }
    }

    if (desensitizeOptions) {
      lines.push('');
      lines.push('* 本报告已进行数据脱敏处理');
    }

    let text = lines.join('\n');
    
    if (desensitizeOptions?.maskWeight) {
      text = text.replace(/[+-]?\s*[\d.]+\s*(kg|千克|公斤|斤|磅|lb)/g, 'XX$1');
      text = text.replace(/体重(增加|减少|变化)[\d.]+/g, '体重$1XX');
      text = text.replace(/(增重|减重)[\d.]+/g, '$1XX');
    }

    return text;
  }

  async exportDesensitizedReport(
    report: WeeklyReport | MonthlyReport,
    format: 'json' | 'text' = 'json',
    options: DesensitizeOptions = {
      maskUserId: true,
      maskWeight: true,
      maskHeight: true,
      maskBirthDate: true,
      maskAllergies: true,
      maskMedicalInfo: true,
    }
  ): Promise<string> {
    return this.exportReport(report, format, options);
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

  private createTrendComparison(
    currentValue: number,
    previousValue: number,
    metricName: string,
    isHigherBetter: boolean
  ): TrendComparison {
    const change = currentValue - previousValue;
    const changePercent = previousValue > 0 ? roundTo((change / previousValue) * 100, 1) : (currentValue > 0 ? 100 : 0);
    
    let direction: 'up' | 'down' | 'stable' = 'stable';
    const thresholdPercent = 5;
    
    if (previousValue === 0 && currentValue > 0) {
      direction = 'up';
    } else if (previousValue > 0 && currentValue === 0) {
      direction = 'down';
    } else if (changePercent > thresholdPercent) {
      direction = 'up';
    } else if (changePercent < -thresholdPercent) {
      direction = 'down';
    }
    
    let description = '';
    if (direction === 'stable') {
      description = `${metricName}基本稳定，变化在合理范围内`;
    } else if (direction === 'up') {
      if (previousValue === 0) {
        description = `${metricName}从无到有，开始记录`;
      } else if (isHigherBetter) {
        description = `${metricName}较上周期提升${changePercent}%，表现良好`;
      } else {
        description = `${metricName}较上周期增加${changePercent}%，需要注意控制`;
      }
    } else {
      if (currentValue === 0) {
        description = `${metricName}本周期未记录`;
      } else if (isHigherBetter) {
        description = `${metricName}较上周期下降${Math.abs(changePercent)}%，需要加强`;
      } else {
        description = `${metricName}较上周期下降${Math.abs(changePercent)}%，趋势良好`;
      }
    }
    
    return {
      currentValue: roundTo(currentValue, 2),
      previousValue: roundTo(previousValue, 2),
      change: roundTo(change, 2),
      changePercent,
      direction,
      description,
    };
  }

  async analyzeTrend(
    userId: string,
    meals: MealRecord[],
    weightRecords: WeightRecord[],
    waterRecords: WaterRecord[],
    goals: UserGoals,
    options?: {
      referenceDate?: number;
      daysToCompare?: number;
    }
  ): Promise<TrendAnalysis> {
    const { referenceDate = getTimestamp(), daysToCompare = 7 } = options || {};
    const dayMs = 24 * 60 * 60 * 1000;
    
    const currentEnd = getEndOfDay(referenceDate);
    const currentStart = getStartOfDay(currentEnd - (daysToCompare - 1) * dayMs);
    const previousEnd = getEndOfDay(currentStart - dayMs);
    const previousStart = getStartOfDay(previousEnd - (daysToCompare - 1) * dayMs);
    
    const currentMeals = meals.filter(m => m.timestamp >= currentStart && m.timestamp <= currentEnd);
    const previousMeals = meals.filter(m => m.timestamp >= previousStart && m.timestamp <= previousEnd);
    
    const currentWeights = weightRecords.filter(w => w.timestamp >= currentStart && w.timestamp <= currentEnd);
    const previousWeights = weightRecords.filter(w => w.timestamp >= previousStart && w.timestamp <= previousEnd);
    
    const currentWater = waterRecords.filter(w => w.timestamp >= currentStart && w.timestamp <= currentEnd);
    const previousWater = waterRecords.filter(w => w.timestamp >= previousStart && w.timestamp <= previousEnd);
    
    const currentDaily = await this.calculateDailyNutrition(currentMeals, currentStart, currentEnd);
    const previousDaily = await this.calculateDailyNutrition(previousMeals, previousStart, previousEnd);
    
    const currentAvg = averageNutrition(currentDaily);
    const previousAvg = averageNutrition(previousDaily);
    
    const safeDivide = (sum: number, count: number): number => {
      return count > 0 ? sum / count : 0;
    };
    
    const currentAvgCalories = safeDivide(
      currentDaily.reduce((sum, d) => sum + d.calories, 0),
      currentDaily.length
    );
    const previousAvgCalories = safeDivide(
      previousDaily.reduce((sum, d) => sum + d.calories, 0),
      previousDaily.length
    );
    
    const currentAvgProtein = safeDivide(
      currentDaily.reduce((sum, d) => sum + (d.protein || 0), 0),
      currentDaily.length
    );
    const previousAvgProtein = safeDivide(
      previousDaily.reduce((sum, d) => sum + (d.protein || 0), 0),
      previousDaily.length
    );
    
    const currentAvgWaterMl = safeDivide(
      currentWater.reduce((sum, w) => sum + w.normalizedAmountMl, 0),
      daysToCompare
    );
    const previousAvgWaterMl = safeDivide(
      previousWater.reduce((sum, w) => sum + w.normalizedAmountMl, 0),
      daysToCompare
    );
    
    const currentAvgWeight = safeDivide(
      currentWeights.reduce((sum, w) => sum + w.normalizedWeightKg, 0),
      currentWeights.length
    );
    const previousAvgWeight = safeDivide(
      previousWeights.reduce((sum, w) => sum + w.normalizedWeightKg, 0),
      previousWeights.length
    );
    
    const caloriesComparison = this.createTrendComparison(
      currentAvgCalories,
      previousAvgCalories,
      '热量摄入',
      false
    );
    
    const proteinComparison = this.createTrendComparison(
      currentAvgProtein,
      previousAvgProtein,
      '蛋白质摄入',
      true
    );
    
    const waterComparison = this.createTrendComparison(
      currentAvgWaterMl,
      previousAvgWaterMl,
      '饮水量',
      true
    );
    
    const weightComparison = this.createTrendComparison(
      currentAvgWeight,
      previousAvgWeight,
      '体重',
      false
    );
    
    const currentCheckIn = this.calculateCheckInStatus(currentMeals, currentStart, currentEnd);
    const previousCheckIn = this.calculateCheckInStatus(previousMeals, previousStart, previousEnd);
    
    const currentDailyDetails = this.calculateDailyCheckInDetails(currentMeals, currentStart, currentEnd, goals.mealFrequency);
    const previousDailyDetails = this.calculateDailyCheckInDetails(previousMeals, previousStart, previousEnd, goals.mealFrequency);
    
    const currentCompleteDays = currentDailyDetails.filter(d => d.status === 'complete').length;
    const previousCompleteDays = previousDailyDetails.filter(d => d.status === 'complete').length;
    
    let nutritionScore = 60;
    const caloriePercent = goals.dailyCalories > 0 ? (currentAvgCalories / goals.dailyCalories) * 100 : 100;
    
    if (caloriesComparison.direction === 'stable') {
      if (caloriePercent >= 90 && caloriePercent <= 110) {
        nutritionScore = 90;
      } else {
        nutritionScore = 75;
      }
    } else if (
      (caloriesComparison.direction === 'down' && currentAvgCalories > goals.dailyCalories) ||
      (caloriesComparison.direction === 'up' && currentAvgCalories < goals.dailyCalories)
    ) {
      nutritionScore = 85;
    }
    nutritionScore = Math.min(100, Math.max(0, nutritionScore));
    
    let waterGoalMl = goals.dailyWater;
    if (goals.waterUnit === UnitType.LITER) waterGoalMl *= 1000;
    const waterScore = waterGoalMl > 0 ? Math.min(100, Math.max(0, roundTo((currentAvgWaterMl / waterGoalMl) * 100, 0))) : 70;
    
    const weightScore = weightComparison.direction === 'stable' ? 85 :
      (weightComparison.direction === 'down' && goals.dietGoal === DietGoal.LOSE_WEIGHT) ? 90 :
      (weightComparison.direction === 'up' && (goals.dietGoal === DietGoal.GAIN_WEIGHT || goals.dietGoal === DietGoal.BUILD_MUSCLE)) ? 90 : 70;
    
    const consistencyScore = Math.min(100, Math.max(0,
      (currentCheckIn.checkInDays / daysToCompare) * 100
    ));
    
    const totalScore = roundTo((nutritionScore + waterScore + weightScore + consistencyScore) / 4, 1);
    
    const insights: string[] = [];
    
    if (nutritionScore >= 80) {
      insights.push('营养摄入控制良好，继续保持');
    } else {
      insights.push('需要更加注意营养均衡和热量控制');
    }
    
    if (waterScore >= 80) {
      insights.push('饮水量充足，继续保持');
    } else {
      insights.push('饮水量不足，建议每天至少喝够8杯水');
    }
    
    if (consistencyScore >= 80) {
      insights.push('打卡坚持度很高，非常棒');
    } else {
      insights.push('打卡频率可以再提升一些，坚持就是胜利');
    }
    
    if (currentCompleteDays > previousCompleteDays) {
      insights.push(`完整打卡天数比上周增加${currentCompleteDays - previousCompleteDays}天，进步明显`);
    } else if (currentCompleteDays < previousCompleteDays) {
      insights.push(`完整打卡天数比上周减少${previousCompleteDays - currentCompleteDays}天，需要加油`);
    }
    
    return {
      period: {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
      },
      calories: caloriesComparison,
      protein: proteinComparison,
      water: waterComparison,
      weight: weightComparison,
      healthScore: {
        nutrition: roundTo(nutritionScore, 1),
        water: roundTo(waterScore, 1),
        weight: roundTo(weightScore, 1),
        consistency: roundTo(consistencyScore, 1),
        total: totalScore,
      },
      weeklyComparison: {
        currentWeek: {
          averageDailyCalories: roundTo(currentAvgCalories, 1),
          averageDailyProtein: roundTo(currentAvgProtein, 1),
          averageDailyWater: roundTo(currentAvgWaterMl, 1),
          averageWeight: roundTo(currentAvgWeight, 2),
          checkInDays: currentCheckIn.checkInDays,
          completeDays: currentCompleteDays,
        },
        previousWeek: {
          averageDailyCalories: roundTo(previousAvgCalories, 1),
          averageDailyProtein: roundTo(previousAvgProtein, 1),
          averageDailyWater: roundTo(previousAvgWaterMl, 1),
          averageWeight: roundTo(previousAvgWeight, 2),
          checkInDays: previousCheckIn.checkInDays,
          completeDays: previousCompleteDays,
        },
      },
      insights,
    };
  }
}
