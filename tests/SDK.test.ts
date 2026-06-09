import { HealthNutritionSDK } from '../src/index';
import { Gender, ActivityLevel, DietGoal, UnitType, MealType, AllergenType, DietPreference } from '../src/types';

describe('HealthNutritionSDK Integration Tests', () => {
  let sdk: HealthNutritionSDK;

  beforeEach(() => {
    sdk = new HealthNutritionSDK();
  });

  const testUserId = 'integration-test-user';

  const testFood = {
    id: 'food-1',
    name: '鸡胸肉',
    category: '肉类',
    servingSize: 100,
    servingUnit: UnitType.GRAM,
    nutritionFacts: {
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
    },
  };

  test('should create user profile and initialize', () => {
    sdk = new HealthNutritionSDK();
  });

  test('should create complete user workflow', async () => {
    const profile = await sdk.userProfile.createProfile({
      nickname: '集成测试用户',
      gender: Gender.MALE,
      birthDate: new Date('1990-01-01').getTime(),
      height: 175,
      heightUnit: UnitType.CENTIMETER,
      weight: 70,
      weightUnit: UnitType.KILOGRAM,
      activityLevel: ActivityLevel.MODERATE,
      dietGoal: DietGoal.LOSE_WEIGHT,
      targetWeight: 65,
      userId: testUserId,
    });

    expect(profile).toBeDefined();
    expect(profile.userId).toBe(testUserId);

    const goals = await sdk.goalCalculation.generateGoals(profile);
    expect(goals).toBeDefined();
    expect(goals.dailyCalories).toBeGreaterThan(0);

    await sdk.userProfile.addAllergy(testUserId, AllergenType.PEANUT);
    await sdk.userProfile.addPreference(testUserId, DietPreference.LOW_CARB);

    const completeData = await sdk.getCompleteUserData(testUserId);
    expect(completeData.profile).toBeDefined();
    expect(completeData.goals).toBeDefined();
    expect(completeData.desensitizedProfile).toBeDefined();
  });

  test('should record meals and get daily progress', async () => {
    await sdk.userProfile.createProfile({
      nickname: '测试用户',
      gender: Gender.MALE,
      birthDate: new Date('1990-01-01').getTime(),
      height: 175,
      heightUnit: UnitType.CENTIMETER,
      weight: 70,
      weightUnit: UnitType.KILOGRAM,
      activityLevel: ActivityLevel.MODERATE,
      dietGoal: DietGoal.LOSE_WEIGHT,
      targetWeight: 65,
      userId: testUserId,
    });

    const goals = await sdk.goalCalculation.generateGoals({
      userId: testUserId,
      nickname: '测试用户',
      gender: Gender.MALE,
      birthDate: new Date('1990-01-01').getTime(),
      height: 175,
      weight: 70,
      activityLevel: ActivityLevel.MODERATE,
      dietGoal: DietGoal.LOSE_WEIGHT,
      targetWeight: 65,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const meal = await sdk.mealRecords.createMealRecord(
      testUserId,
      MealType.LUNCH,
      [{ food: testFood, quantity: 150, unit: UnitType.GRAM }]
    );

    expect(meal).toBeDefined();
    expect(meal.totalNutrition.calories).toBeCloseTo(247.5, 0);

    await sdk.mealRecords.recordWater(testUserId, 250, UnitType.MILLILITER);
    await sdk.mealRecords.recordWeight(testUserId, 69.8, UnitType.KILOGRAM);

    const dailyProgress = await sdk.getDailyProgress(testUserId);
    expect(dailyProgress).toBeDefined();
    expect(dailyProgress.nutrition.calories).toBeGreaterThan(0);
    expect(dailyProgress.meals.length).toBe(1);
    expect(dailyProgress.water.amount).toBeGreaterThanOrEqual(250);
    expect(dailyProgress.weight).toBeDefined();
  });

  test('should generate weekly report', async () => {
    const userData = await sdk.userProfile.createProfile({
      nickname: '周报测试用户',
      gender: Gender.MALE,
      birthDate: new Date('1990-01-01').getTime(),
      height: 175,
      heightUnit: UnitType.CENTIMETER,
      weight: 70,
      weightUnit: UnitType.KILOGRAM,
      activityLevel: ActivityLevel.MODERATE,
      dietGoal: DietGoal.LOSE_WEIGHT,
      targetWeight: 65,
      userId: 'weekly-report-user',
    });

    await sdk.goalCalculation.generateGoals(userData);

    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      const timestamp = now - (6 - i) * 24 * 60 * 60 * 1000;
      await sdk.mealRecords.createMealRecord(
        'weekly-report-user',
        MealType.LUNCH,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp }
      );
      await sdk.mealRecords.recordWeight(
        'weekly-report-user',
        70 - i * 0.2,
        UnitType.KILOGRAM,
        { timestamp }
      );
    }

    const report = await sdk.generateWeeklyReport('weekly-report-user', 0);
    expect(report).toBeDefined();
    expect(report?.averageDailyCalories).toBeGreaterThan(0);
    expect(report?.weightTrend.length).toBe(7);
    expect(report?.checkInDays).toBe(7);
  });

  test('should handle reminders and alerts', async () => {
    await sdk.reminderRules.getDefaultReminderSetup(testUserId);
    await sdk.reminderRules.getDefaultAlerts(testUserId);

    const reminders = await sdk.reminderRules.getReminders(testUserId);
    expect(reminders.length).toBeGreaterThan(0);

    const alerts = await sdk.reminderRules.getAlertRules(testUserId);
    expect(alerts.length).toBeGreaterThan(0);

    const alertCheck = await sdk.checkTodayAlerts(testUserId);
    expect(alertCheck).toBeDefined();
  });

  test('should estimate food portions and calculate nutrition', async () => {
    await sdk.foodEstimation.addFoodItem(testFood);

    const searchResults = await sdk.foodEstimation.searchFood('鸡胸肉');
    expect(searchResults.length).toBeGreaterThan(0);

    const estimate = await sdk.quickCalorieEstimate('鸡胸肉', 100, UnitType.GRAM);
    expect(estimate).toBeDefined();
    expect(estimate.estimatedNutrition.calories).toBeGreaterThan(0);

    const portion = await sdk.foodEstimation.estimatePortion('鸡胸肉', undefined, 'palm');
    expect(portion.quantity).toBeGreaterThan(0);
  });

  test('should calculate nutrition summary and gaps', async () => {
    const profile = await sdk.userProfile.createProfile({
      nickname: '营养测试用户',
      gender: Gender.FEMALE,
      birthDate: new Date('1992-06-15').getTime(),
      height: 165,
      heightUnit: UnitType.CENTIMETER,
      weight: 60,
      weightUnit: UnitType.KILOGRAM,
      activityLevel: ActivityLevel.LIGHT,
      dietGoal: DietGoal.MAINTAIN,
      userId: 'nutrition-test-user',
    });

    const goals = await sdk.goalCalculation.generateGoals(profile);

    const meals = await sdk.mealRecords.createMealRecord(
      'nutrition-test-user',
      MealType.DINNER,
      [
        { food: testFood, quantity: 120, unit: UnitType.GRAM },
        {
          food: {
            ...testFood,
            id: 'food-2',
            name: '西兰花',
            category: '蔬菜',
            nutritionFacts: {
              calories: 34,
              protein: 2.8,
              carbs: 7,
              fat: 0.4,
            },
          },
          quantity: 150,
          unit: UnitType.GRAM,
        },
      ]
    );

    const daily = await sdk.nutritionSummary.calculateDailySummaryWithGoals(
      [meals],
      goals
    );

    expect(daily.actual.protein).toBeGreaterThan(0);
    expect(daily.achievement.calories).toBeGreaterThan(0);

    const macroRatio = await sdk.nutritionSummary.calculateMacronutrientRatio(meals.totalNutrition);
    expect(macroRatio.protein + macroRatio.carbs + macroRatio.fat).toBeCloseTo(100, 0);

    const gaps = await sdk.nutritionSummary.calculateNutrientGaps(daily.actual, goals);
    expect(Array.isArray(gaps)).toBe(true);
  });

  test('should handle unit conversions', async () => {
    const kgValue = 1;
    const gValue = sdk.convertUnit(kgValue, UnitType.KILOGRAM, UnitType.GRAM);
    expect(gValue).toBe(1000);

    const mlValue = 500;
    const lValue = sdk.convertUnit(mlValue, UnitType.MILLILITER, UnitType.LITER);
    expect(lValue).toBe(0.5);

    const cmValue = 175;
    const inchValue = sdk.convertUnit(cmValue, UnitType.CENTIMETER, UnitType.INCH);
    expect(inchValue).toBeCloseTo(68.9, 1);
  });

  test('should handle food favorites and combinations', async () => {
    await sdk.mealRecords.addFavoriteFood(testUserId, testFood.id);
    const favorites = await sdk.mealRecords.getFavoriteFoods(testUserId);
    expect(favorites).toContain(testFood.id);

    const combo = await sdk.mealRecords.createFoodCombination(
      testUserId,
      '减脂套餐',
      [
        { food: testFood, quantity: 150, unit: UnitType.GRAM },
        {
          food: { ...testFood, id: 'food-veg', name: '蔬菜沙拉', category: '蔬菜',
            nutritionFacts: { calories: 50, protein: 3, carbs: 8, fat: 1.5 },
          },
          quantity: 100,
          unit: UnitType.GRAM,
        },
      ],
      MealType.LUNCH
    );

    expect(combo).toBeDefined();
    expect(combo.totalNutrition.calories).toBeGreaterThan(0);

    const usedMeal = await sdk.mealRecords.useFoodCombination(testUserId, combo.id);
    expect(usedMeal).toBeDefined();
  });

  test('should generate comparison reports', async () => {
    const profile = await sdk.userProfile.createProfile({
      nickname: '对比测试用户',
      gender: Gender.MALE,
      birthDate: new Date('1988-03-20').getTime(),
      height: 180,
      heightUnit: UnitType.CENTIMETER,
      weight: 80,
      weightUnit: UnitType.KILOGRAM,
      activityLevel: ActivityLevel.ACTIVE,
      dietGoal: DietGoal.BUILD_MUSCLE,
      targetWeight: 78,
      userId: 'comparison-user',
    });

    const goals = await sdk.goalCalculation.generateGoals(profile);

    const report1 = await sdk.generateWeeklyReport('comparison-user', 1);
    const report2 = await sdk.generateWeeklyReport('comparison-user', 0);

    if (report1 && report2) {
      const comparison = await sdk.reportGeneration.generateComparisonReport(report2, report1);
      expect(comparison).toBeDefined();
      expect(Array.isArray(comparison.improvements)).toBe(true);
      expect(Array.isArray(comparison.areasToImprove)).toBe(true);
    }
  });
});
