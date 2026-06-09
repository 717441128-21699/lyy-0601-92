import { SDKConfig, UnitType } from './types';
import { UserProfileManager } from './modules/UserProfile';
import { MealRecordsManager } from './modules/MealRecords';
import { FoodEstimationManager } from './modules/FoodEstimation';
import { NutritionSummaryManager } from './modules/NutritionSummary';
import { GoalCalculationManager } from './modules/GoalCalculation';
import { ReminderRulesManager } from './modules/ReminderRules';
import { ReportGenerationManager } from './modules/ReportGeneration';
import { convertUnit, getEndOfDay } from './utils/helpers';

export * from './types';
export * from './utils/helpers';
export * from './adapters/InMemoryStorageAdapter';
export { desensitizeReport } from './utils/helpers';

export class HealthNutritionSDK {
  private config: SDKConfig;

  public userProfile: UserProfileManager;
  public mealRecords: MealRecordsManager;
  public foodEstimation: FoodEstimationManager;
  public nutritionSummary: NutritionSummaryManager;
  public goalCalculation: GoalCalculationManager;
  public reminderRules: ReminderRulesManager;
  public reportGeneration: ReportGenerationManager;

  constructor(config: SDKConfig = {}) {
    this.config = config;

    this.userProfile = new UserProfileManager(config);
    this.mealRecords = new MealRecordsManager(config);
    this.foodEstimation = new FoodEstimationManager(config);
    this.nutritionSummary = new NutritionSummaryManager(config);
    this.goalCalculation = new GoalCalculationManager(config);
    this.reminderRules = new ReminderRulesManager(config);
    this.reportGeneration = new ReportGenerationManager(config);
  }

  async initializeUser(userId: string): Promise<void> {
    const profile = await this.userProfile.getProfile(userId);
    if (profile) {
      const goals = await this.goalCalculation.getGoals(userId);
      if (!goals) {
        await this.goalCalculation.generateGoals(profile);
      }

      const reminders = await this.reminderRules.getReminders(userId);
      if (reminders.length === 0) {
        await this.reminderRules.getDefaultReminderSetup(userId);
      }

      const alerts = await this.reminderRules.getAlertRules(userId);
      if (alerts.length === 0) {
        await this.reminderRules.getDefaultAlerts(userId);
      }
    }
  }

  getConfig(): SDKConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<SDKConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async getCompleteUserData(userId: string): Promise<{
    profile: import('./types').UserProfile | null;
    goals: import('./types').UserGoals | null;
    desensitizedProfile: Partial<import('./types').UserProfile> | null;
  }> {
    const profile = await this.userProfile.getProfile(userId);
    const goals = await this.goalCalculation.getGoals(userId);
    const desensitizedProfile = await this.userProfile.getDesensitizedProfile(userId);

    return { profile, goals, desensitizedProfile };
  }

  async quickCalorieEstimate(
    foodName: string,
    quantity?: number,
    unit?: import('./types').UnitType,
    description?: string
  ): Promise<{
    food: import('./types').FoodItem | null;
    estimatedQuantity: number;
    estimatedUnit: import('./types').UnitType;
    estimatedNutrition: import('./types').NutritionFacts;
    confidence: number;
  }> {
    return this.foodEstimation.quickEstimate(foodName, quantity, unit, description);
  }

  async getDailyProgress(
    userId: string,
    date?: number
  ): Promise<{
    nutrition: import('./types').NutritionFacts & { mealCount: number; waterMl: number };
    goals: import('./types').UserGoals | null;
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
    meals: import('./types').MealRecord[];
    water: { amount: number; unit: import('./types').UnitType; cups: number };
    weight: import('./types').WeightRecord | null;
    checkIn: import('./types').CheckInStatus;
  }> {
    const targetDate = date || Date.now();
    const meals = await this.mealRecords.getMealsByDate(userId, targetDate);
    const water = await this.mealRecords.getWaterIntakeByDate(userId, targetDate);
    const weight = await this.mealRecords.getLatestWeight(userId);
    const goals = await this.goalCalculation.getGoals(userId);

    const nutrition = await this.mealRecords.getDailyNutritionSummary(userId, targetDate);

    let achievement = { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 };
    let isExceeded = { calories: false, protein: false, carbs: false, fat: false };

    if (goals) {
      const summaryResult = await this.nutritionSummary.calculateDailySummaryWithGoals(
        meals,
        goals,
        { amount: water.amount, unit: water.unit }
      );
      achievement = summaryResult.achievement;
      isExceeded = summaryResult.isExceeded;
    }

    const allMeals = await this.mealRecords.getMealsByDateRange(userId, 0, Date.now());
    const checkIn = await this.nutritionSummary.getCheckInStatus(allMeals, goals?.mealFrequency || 3);

    return { nutrition, goals, achievement, isExceeded, meals, water, weight, checkIn };
  }

  async generateWeeklyReport(userId: string, weekOffset: number = 0): Promise<import('./types').WeeklyReport | null> {
    const profile = await this.userProfile.getProfile(userId);
    const goals = await this.goalCalculation.getGoals(userId);

    if (!profile || !goals) return null;

    const now = Date.now();
    const weekEnd = now - weekOffset * 7 * 24 * 60 * 60 * 1000;
    const weekStart = weekEnd - 6 * 24 * 60 * 60 * 1000;

    const meals = await this.mealRecords.getMealsByDateRange(userId, weekStart - 7 * 24 * 60 * 60 * 1000, weekEnd);
    const weightRecords = await this.mealRecords.getWeightRecords(userId, weekStart - 7 * 24 * 60 * 60 * 1000, weekEnd);
    const waterRecords = await this.mealRecords.getWaterRecords(userId, weekStart, weekEnd);

    const formattedWater = waterRecords.map(r => ({
      date: r.timestamp,
      amount: r.amount,
      unit: r.unit,
    }));

    return this.reportGeneration.generateWeeklyReport(
      userId,
      profile,
      goals,
      meals,
      weightRecords,
      formattedWater,
      weekOffset
    );
  }

  async generateMonthlyReport(userId: string, monthOffset: number = 0): Promise<import('./types').MonthlyReport | null> {
    const profile = await this.userProfile.getProfile(userId);
    const goals = await this.goalCalculation.getGoals(userId);

    if (!profile || !goals) return null;

    const now = Date.now();
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() - monthOffset);
    const monthEnd = getEndOfDay(targetDate.getTime());
    const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1).getTime();

    const meals = await this.mealRecords.getMealsByDateRange(userId, monthStart - 30 * 24 * 60 * 60 * 1000, monthEnd);
    const weightRecords = await this.mealRecords.getWeightRecords(userId, monthStart - 30 * 24 * 60 * 60 * 1000, monthEnd);
    const waterRecords = await this.mealRecords.getWaterRecords(userId, monthStart, monthEnd);

    const formattedWater = waterRecords.map(r => ({
      date: r.timestamp,
      amount: r.amount,
      unit: r.unit,
    }));

    return this.reportGeneration.generateMonthlyReport(
      userId,
      profile,
      goals,
      meals,
      weightRecords,
      formattedWater
    );
  }

  async checkTodayAlerts(
    userId: string
  ): Promise<{
    dueReminders: Array<{
      reminder: import('./types').ReminderRule;
      dueAt: number;
      minutesUntilDue: number;
    }>;
    preMealReminders: Array<{
      reminder: import('./types').ReminderRule;
      mealType: import('./types').MealType;
      minutesUntilMeal: number;
    }>;
    triggeredAlerts: Array<{
      alert: import('./types').AlertRule;
      currentValue: number;
      threshold: number;
      message: string;
    }>;
  }> {
    const today = new Date().getTime();
    const meals = await this.mealRecords.getMealsByDate(userId, today);
    const weightRecords = await this.mealRecords.getWeightRecords(userId, today - 30 * 24 * 60 * 60 * 1000, today);
    const goals = await this.goalCalculation.getGoals(userId);
    const nutrition = await this.mealRecords.getDailyNutritionSummary(userId, today);

    const reminderResult = await this.reminderRules.checkDueReminders(userId);

    let alertResult = { triggeredAlerts: [] as any[] };
    if (goals) {
      alertResult = await this.reminderRules.checkAlerts(
        userId,
        nutrition,
        goals,
        weightRecords,
        meals
      );
    }

    return {
      ...reminderResult,
      ...alertResult,
    };
  }

  async exportReport(
    report: import('./types').WeeklyReport | import('./types').MonthlyReport,
    format: 'json' | 'text' = 'json',
    desensitizeOptions?: import('./types').DesensitizeOptions
  ): Promise<string> {
    return this.reportGeneration.exportReport(report, format, desensitizeOptions);
  }

  async exportDesensitizedReport(
    report: import('./types').WeeklyReport | import('./types').MonthlyReport,
    format: 'json' | 'text' = 'json',
    options?: import('./types').DesensitizeOptions
  ): Promise<string> {
    return this.reportGeneration.exportDesensitizedReport(report, format, options);
  }

  convertUnit(
    value: number,
    fromUnit: import('./types').UnitType,
    toUnit: import('./types').UnitType
  ): number {
    return convertUnit(value, fromUnit, toUnit);
  }

  async analyzeTrend(
    userId: string,
    options?: {
      referenceDate?: number;
      daysToCompare?: number;
    }
  ): Promise<import('./types').TrendAnalysis | null> {
    const profile = await this.userProfile.getProfile(userId);
    const goals = await this.goalCalculation.getGoals(userId);
    
    if (!profile || !goals) return null;
    
    const { referenceDate = Date.now(), daysToCompare = 7 } = options || {};
    const dayMs = 24 * 60 * 60 * 1000;
    const startDate = referenceDate - (daysToCompare * 2) * dayMs;
    
    const meals = await this.mealRecords.getMealsByDateRange(userId, startDate, referenceDate);
    const weights = await this.mealRecords.getWeightRecords(userId, startDate, referenceDate);
    const water = await this.mealRecords.getWaterRecords(userId, startDate, referenceDate);
    
    return this.reportGeneration.analyzeTrend(userId, meals, weights, water, goals, options);
  }
}

export default HealthNutritionSDK;
