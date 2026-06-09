import {
  HealthNutritionSDK,
  InMemoryStorageAdapter,
  desensitizeUserProfile,
  desensitizeWeeklyReport,
} from '../src/index';
import {
  Gender,
  ActivityLevel,
  DietGoal,
  UnitType,
  MealType,
  AllergenType,
} from '../src/types';

describe('Advanced Features Tests', () => {
  const testFood = {
    id: 'adv-food-1',
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

  const riceFood = {
    id: 'adv-food-2',
    name: '米饭',
    category: '主食',
    servingSize: 100,
    servingUnit: UnitType.GRAM,
    nutritionFacts: {
      calories: 130,
      protein: 2.7,
      carbs: 28,
      fat: 0.3,
    },
  };

  beforeAll(() => {
    InMemoryStorageAdapter.clearShared();
  });

  afterEach(() => {
    InMemoryStorageAdapter.clearShared();
  });

  describe('1. Unit Auto-Conversion Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'unit-test-user';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    test('should auto-convert weight units when recording meals (kg, lb, oz, g)', async () => {
      await sdk.userProfile.createProfile({
        nickname: '单位测试用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const mealInGrams = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 150, unit: UnitType.GRAM }]
      );
      expect(mealInGrams.foods[0].normalizedQuantity).toBeCloseTo(150, 0);
      expect(mealInGrams.foods[0].normalizedUnit).toBe(UnitType.GRAM);

      const mealInKg = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 0.15, unit: UnitType.KILOGRAM }]
      );
      expect(mealInKg.foods[0].normalizedQuantity).toBeCloseTo(150, 0);
      expect(mealInKg.foods[0].normalizedUnit).toBe(UnitType.GRAM);
      expect(mealInKg.totalNutrition.calories).toBeCloseTo(mealInGrams.totalNutrition.calories, 0);

      const mealInLb = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 0.3307, unit: UnitType.POUND }]
      );
      expect(mealInLb.foods[0].normalizedQuantity).toBeCloseTo(150, 0);
      expect(mealInLb.totalNutrition.calories).toBeCloseTo(mealInGrams.totalNutrition.calories, -1);

      const mealInOz = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 5.291, unit: UnitType.OUNCE }]
      );
      expect(mealInOz.foods[0].normalizedQuantity).toBeCloseTo(150, 0);
      expect(mealInOz.totalNutrition.calories).toBeCloseTo(mealInGrams.totalNutrition.calories, -1);
    });

    test('should auto-convert volume units when recording water (ml, cup)', async () => {
      await sdk.userProfile.createProfile({
        nickname: '饮水单位测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const waterInMl = await sdk.mealRecords.recordWater(testUserId, 240, UnitType.MILLILITER);
      expect(waterInMl.normalizedAmountMl).toBe(240);
      expect(waterInMl.cups).toBeCloseTo(1, 1);

      const waterInCup = await sdk.mealRecords.recordWater(testUserId, 1, UnitType.CUP);
      expect(waterInCup.normalizedAmountMl).toBeCloseTo(240, 0);
      expect(waterInCup.cups).toBeCloseTo(1, 1);

      const waterInLiter = await sdk.mealRecords.recordWater(testUserId, 0.5, UnitType.LITER);
      expect(waterInLiter.normalizedAmountMl).toBe(500);
      expect(waterInLiter.cups).toBeCloseTo(2.1, 1);

      const today = new Date().getTime();
      const dailyWater = await sdk.mealRecords.getWaterIntakeByDate(testUserId, today);
      expect(dailyWater.totalMl).toBe(240 + 240 + 500);
      expect(dailyWater.totalCups).toBeCloseTo(4.1, 1);
    });

    test('should auto-convert weight units when recording weight (kg, lb)', async () => {
      await sdk.userProfile.createProfile({
        nickname: '体重单位测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const weightInKg = await sdk.mealRecords.recordWeight(testUserId, 70.5, UnitType.KILOGRAM);
      expect(weightInKg.normalizedWeightKg).toBe(70.5);

      const weightInLb = await sdk.mealRecords.recordWeight(testUserId, 155.4, UnitType.POUND);
      expect(weightInLb.normalizedWeightKg).toBeCloseTo(70.5, 1);
    });

    test('should use normalized values for nutrition statistics', async () => {
      await sdk.userProfile.createProfile({
        nickname: '营养统计测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: testFood, quantity: 0.1, unit: UnitType.KILOGRAM }]
      );
      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 3.527, unit: UnitType.OUNCE }]
      );
      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.DINNER,
        [{ food: testFood, quantity: 0.2205, unit: UnitType.POUND }]
      );

      const today = new Date().getTime();
      const daily = await sdk.mealRecords.getDailyNutritionSummary(testUserId, today);
      const expectedTotal = 100 + 100 + 100;
      const expectedCalories = (expectedTotal / 100) * 165;

      expect(daily.calories).toBeCloseTo(expectedCalories, -1);
    });
  });

  describe('2. InMemoryStorageAdapter and Cross-Instance Tests', () => {
    const testUserId = 'cross-instance-user';

    test('should persist data across SDK instances using shared storage', async () => {
      InMemoryStorageAdapter.clearShared();
      const sharedStorage = InMemoryStorageAdapter.getSharedInstance();

      const sdk1 = new HealthNutritionSDK({ storageAdapter: sharedStorage });

      const profile = await sdk1.userProfile.createProfile({
        nickname: '跨实例用户',
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

      await sdk1.mealRecords.addFavoriteFood(testUserId, testFood.id);
      await sdk1.mealRecords.addFavoriteFood(testUserId, riceFood.id);

      const combo = await sdk1.mealRecords.createFoodCombination(
        testUserId,
        '常用午餐',
        [
          { food: testFood, quantity: 150, unit: UnitType.GRAM },
          { food: riceFood, quantity: 100, unit: UnitType.GRAM },
        ],
        MealType.LUNCH
      );
      expect(combo).toBeDefined();

      await sdk1.reminderRules.getDefaultReminderSetup(testUserId);
      const reminders1 = await sdk1.reminderRules.getReminders(testUserId);
      expect(reminders1.length).toBeGreaterThan(0);

      const sdk2 = new HealthNutritionSDK({ storageAdapter: sharedStorage });

      const profile2 = await sdk2.userProfile.getProfile(testUserId);
      expect(profile2).toBeDefined();
      expect(profile2?.nickname).toBe('跨实例用户');

      const favorites2 = await sdk2.mealRecords.getFavoriteFoods(testUserId);
      expect(favorites2).toContain(testFood.id);
      expect(favorites2).toContain(riceFood.id);

      const combos2 = await sdk2.mealRecords.getFoodCombinations(testUserId);
      expect(combos2.length).toBe(1);
      expect(combos2[0].name).toBe('常用午餐');

      const reminders2 = await sdk2.reminderRules.getReminders(testUserId);
      expect(reminders2.length).toBe(reminders1.length);
    });

    test('should use food combinations created by another instance', async () => {
      InMemoryStorageAdapter.clearShared();
      const sharedStorage = InMemoryStorageAdapter.getSharedInstance();

      const sdk1 = new HealthNutritionSDK({ storageAdapter: sharedStorage });
      await sdk1.userProfile.createProfile({
        nickname: '组合复用测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const combo = await sdk1.mealRecords.createFoodCombination(
        testUserId,
        '快速午餐',
        [
          { food: testFood, quantity: 120, unit: UnitType.GRAM },
          { food: riceFood, quantity: 80, unit: UnitType.GRAM },
        ],
        MealType.LUNCH
      );

      const sdk2 = new HealthNutritionSDK({ storageAdapter: sharedStorage });
      const usedMeal = await sdk2.mealRecords.useFoodCombination(testUserId, combo.id);
      expect(usedMeal).toBeDefined();
      expect(usedMeal!.totalNutrition.calories).toBeGreaterThan(0);
      expect(usedMeal!.foods.length).toBe(2);

      const meals2 = await sdk2.mealRecords.getMealsByDate(testUserId, Date.now());
      expect(meals2.length).toBe(1);
    });

    test('should have isolated storage when not using shared mode', async () => {
      const storage1 = new InMemoryStorageAdapter({ useShared: false });
      const storage2 = new InMemoryStorageAdapter({ useShared: false });

      const sdk1 = new HealthNutritionSDK({ storageAdapter: storage1 });
      const sdk2 = new HealthNutritionSDK({ storageAdapter: storage2 });

      await sdk1.userProfile.createProfile({
        nickname: '独立用户1',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: 'user-1',
      });

      const profile2 = await sdk2.userProfile.getProfile('user-1');
      expect(profile2).toBeNull();
    });
  });

  describe('3. Daily/Weekly Report Refinement Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'report-test-user';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    test('should show 0 for empty check-in days', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '空打卡测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(profile);

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();
      expect(report?.checkInDays).toBe(0);
      expect(report?.checkInStreak).toBe(0);

      const dailyDetails = report?.dailyCheckInDetails;
      expect(dailyDetails).toBeDefined();
      expect(dailyDetails?.length).toBe(7);
      
      const emptyDays = dailyDetails?.filter(d => d.status === 'empty') || [];
      expect(emptyDays.length).toBe(7);
      
      for (const day of emptyDays) {
        expect(day.mealCount).toBe(0);
        expect(day.description).toContain('未记录');
      }
    });

    test('should distinguish partial check-in (1 meal) from complete check-in', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '部分打卡测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });
      await sdk.goalCalculation.generateGoals(profile);

      const now = Date.now();
      const dayStart = now - 2 * 24 * 60 * 60 * 1000;

      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp: dayStart + 8 * 60 * 60 * 1000 }
      );

      const fullDayStart = now - 1 * 24 * 60 * 60 * 1000;
      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp: fullDayStart + 8 * 60 * 60 * 1000 }
      );
      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp: fullDayStart + 12 * 60 * 60 * 1000 }
      );
      await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.DINNER,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp: fullDayStart + 18 * 60 * 60 * 1000 }
      );

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      const dailyDetails = report?.dailyCheckInDetails || [];

      const partialDay = dailyDetails.find(d => d.status === 'partial');
      expect(partialDay).toBeDefined();
      expect(partialDay?.mealCount).toBe(1);
      expect(partialDay?.description).toContain('还差');
      expect(partialDay?.description).toContain('餐');

      const completeDay = dailyDetails.find(d => d.status === 'complete');
      expect(completeDay).toBeDefined();
      expect(completeDay?.mealCount).toBeGreaterThanOrEqual(3);
      expect(completeDay?.description).toContain('已完成');
    });

    test('should provide detailed reasons for weight fluctuations', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '体重波动测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.LOSE_WEIGHT,
        targetWeight: 65,
        userId: testUserId,
      });
      await sdk.goalCalculation.generateGoals(profile);

      const now = Date.now();
      const weights = [70, 69.3, 69.9, 70.8, 70.1, 69.5, 68.8];

      for (let i = 0; i < 7; i++) {
        const timestamp = now - (6 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.recordWeight(testUserId, weights[i], UnitType.KILOGRAM, { timestamp });

        if (i >= 1) {
          await sdk.mealRecords.createMealRecord(
            testUserId,
            MealType.LUNCH,
            [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
            { timestamp }
          );
        }
      }

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();

      const abnormal = report?.abnormalFluctuations || [];
      for (const fluctuation of abnormal) {
        expect(fluctuation.description).toBeDefined();
        expect(fluctuation.possibleReasons).toBeDefined();
        expect(Array.isArray(fluctuation.possibleReasons)).toBe(true);
        expect(fluctuation.possibleReasons.length).toBeGreaterThan(0);
      }

      const nutrientGaps = report?.nutrientGaps || [];
      for (const gap of nutrientGaps) {
        expect(gap.percentage).toBeDefined();
        expect(gap.percentage).toBeLessThan(80);
      }
    });
  });

  describe('4. Data Desensitization Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'desensitize-test-user';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    test('should mask sensitive fields in user profile when desensitized', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '脱敏测试用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-15').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70.5,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
        allergies: [AllergenType.PEANUT, AllergenType.SHELLFISH],
        medicalConditions: ['高血压'],
        medications: ['降压药'],
      });

      const desensitized = desensitizeUserProfile(profile, {
        maskUserId: true,
        maskWeight: true,
        maskHeight: true,
        maskBirthDate: true,
        maskAllergies: true,
        maskMedicalInfo: true,
      });

      expect(desensitized.userId).not.toBe(testUserId);
      expect(desensitized.userId).toContain('*');

      expect(desensitized.weight).toBeUndefined();
      expect(desensitized.weightUnit).toBeUndefined();
      expect((desensitized as any).weightRange).toBeDefined();
      expect(typeof (desensitized as any).weightRange).toBe('string');

      expect(desensitized.height).toBeUndefined();
      expect(desensitized.heightUnit).toBeUndefined();
      expect((desensitized as any).heightRange).toBeDefined();
      expect(typeof (desensitized as any).heightRange).toBe('string');

      expect(desensitized.birthDate).toBeUndefined();
      expect((desensitized as any).ageGroup).toBeDefined();
      expect(typeof (desensitized as any).ageGroup).toBe('string');

      expect(desensitized.allergies).toBeUndefined();
      expect((desensitized as any).allergyCount).toBe(2);

      expect(desensitized.medicalConditions).toBeUndefined();
      expect(desensitized.medications).toBeUndefined();
      expect((desensitized as any).hasMedicalConditions).toBe(true);
      expect((desensitized as any).medicationCount).toBe(1);
    });

    test('should export desensitized report in JSON format', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '脱敏报告测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.LOSE_WEIGHT,
        targetWeight: 65,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(profile);

      const now = Date.now();
      for (let i = 0; i < 7; i++) {
        const timestamp = now - (6 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.LUNCH,
          [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
          { timestamp }
        );
        await sdk.mealRecords.recordWeight(
          testUserId,
          70 - i * 0.3,
          UnitType.KILOGRAM,
          { timestamp }
        );
      }

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();

      const desensitizedJson = await sdk.exportDesensitizedReport(report!, 'json');
      const parsed = JSON.parse(desensitizedJson);

      expect(parsed.userId).not.toBe(testUserId);
      expect(parsed.userId).toContain('*');
      expect(desensitizedJson).toContain('*');

      const normalJson = await sdk.exportReport(report!, 'json');
      const normalParsed = JSON.parse(normalJson);
      expect(normalParsed.userId).toBe(testUserId);
    });

    test('should export desensitized report in text format', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '文本脱敏报告',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(profile);

      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        const timestamp = now - (2 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.LUNCH,
          [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
          { timestamp }
        );
        await sdk.mealRecords.recordWeight(
          testUserId,
          70 - i * 0.2,
          UnitType.KILOGRAM,
          { timestamp }
        );
      }

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();

      const desensitizedText = await sdk.exportDesensitizedReport(report!, 'text');
      expect(desensitizedText).toContain('=== 健康报告 ===');
      expect(desensitizedText).toContain('平均每日热量');
      expect(desensitizedText).toContain('打卡天数');
      expect(desensitizedText).toContain('数据脱敏处理');

      const normalText = await sdk.exportReport(report!, 'text');
      expect(normalText).not.toContain('数据脱敏处理');
    });

    test('should not expose original weight values in desensitized report', async () => {
      const profile = await sdk.userProfile.createProfile({
        nickname: '体重脱敏测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        weight: 70.5,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.LOSE_WEIGHT,
        targetWeight: 65,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(profile);

      const now = Date.now();
      const testWeight = 70.5;
      for (let i = 0; i < 3; i++) {
        const timestamp = now - (2 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.recordWeight(
          testUserId,
          testWeight + i * 0.6,
          UnitType.KILOGRAM,
          { timestamp }
        );
      }

      const report = await sdk.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();

      const desensitizedReport = desensitizeWeeklyReport(report!, {
        maskUserId: true,
        maskWeight: true,
      });

      for (const weight of desensitizedReport.weightTrend) {
        const decimalPart = weight.toString().split('.')[1];
        expect(decimalPart?.length || 0).toBeLessThanOrEqual(1);
      }

      const changeDecimal = desensitizedReport.weightChange.toString().split('.')[1];
      expect(changeDecimal?.length || 0).toBeLessThanOrEqual(1);

      for (const fluctuation of desensitizedReport.abnormalFluctuations) {
        expect(fluctuation.description).toContain('XXkg');
      }
    });
  });

  describe('5. Integration Flow Tests', () => {
    test('complete flow: mixed unit recording -> restart SDK -> view report -> export desensitized', async () => {
      InMemoryStorageAdapter.clearShared();
      const sharedStorage = InMemoryStorageAdapter.getSharedInstance();
      const testUserId = 'flow-test-user';

      const sdk1 = new HealthNutritionSDK({ storageAdapter: sharedStorage });
      const profile = await sdk1.userProfile.createProfile({
        nickname: '流程测试用户',
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
        allergies: [AllergenType.PEANUT],
      });
      await sdk1.goalCalculation.generateGoals(profile);

      await sdk1.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: testFood, quantity: 0.1, unit: UnitType.KILOGRAM }]
      );
      await sdk1.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: testFood, quantity: 5.29, unit: UnitType.OUNCE }]
      );
      await sdk1.mealRecords.recordWater(testUserId, 1, UnitType.CUP);
      await sdk1.mealRecords.recordWater(testUserId, 500, UnitType.MILLILITER);
      await sdk1.mealRecords.recordWeight(testUserId, 154.3, UnitType.POUND);

      const combo = await sdk1.mealRecords.createFoodCombination(
        testUserId,
        '标准晚餐',
        [
          { food: testFood, quantity: 150, unit: UnitType.GRAM },
          { food: riceFood, quantity: 100, unit: UnitType.GRAM },
        ],
        MealType.DINNER
      );

      const sdk2 = new HealthNutritionSDK({ storageAdapter: sharedStorage });
      await sdk2.mealRecords.useFoodCombination(testUserId, combo.id);

      const profile2 = await sdk2.userProfile.getProfile(testUserId);
      expect(profile2).toBeDefined();

      const combos2 = await sdk2.mealRecords.getFoodCombinations(testUserId);
      expect(combos2.length).toBe(1);

      const today = Date.now();
      const dailyWater = await sdk2.mealRecords.getWaterIntakeByDate(testUserId, today);
      expect(dailyWater.totalMl).toBeCloseTo(240 + 500, 0);
      expect(dailyWater.totalCups).toBeCloseTo(1 + 2.1, 1);

      const dailyNutrition = await sdk2.mealRecords.getDailyNutritionSummary(testUserId, today);
      expect(dailyNutrition.calories).toBeGreaterThan(0);

      const goals2 = await sdk2.goalCalculation.getGoals(testUserId);
      expect(goals2).toBeDefined();

      const report = await sdk2.generateWeeklyReport(testUserId, 0);
      expect(report).toBeDefined();
      expect(report?.checkInDays).toBeGreaterThanOrEqual(1);
      expect(report?.dailyCheckInDetails.length).toBe(7);

      const desensitizedJson = await sdk2.exportDesensitizedReport(report!, 'json');
      const parsed = JSON.parse(desensitizedJson);
      expect(parsed.userId).not.toBe(testUserId);
      expect(parsed.weightChange.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(1);

      const dailyDetails = parsed.dailyCheckInDetails;
      const todayDetail = dailyDetails.find((d: any) =>
        new Date(d.date).toDateString() === new Date().toDateString()
      );
      expect(todayDetail).toBeDefined();
      expect(['partial', 'complete']).toContain(todayDetail.status);
      expect(todayDetail.mealCount).toBeGreaterThanOrEqual(3);

      const normalReport = await sdk2.exportReport(report!, 'json');
      const normalParsed = JSON.parse(normalReport);
      expect(normalParsed.userId).toBe(testUserId);
    });
  });

  describe('5. Custom Food Library Conversion Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'food-lib-user';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    test('should calculate nutrition using per-100g base with cooking conversion', async () => {
      await sdk.userProfile.createProfile({
        nickname: '自定义食物库用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const customRice = {
        id: 'custom-rice-1',
        name: '五常大米',
        category: '主食',
        servingSize: 100,
        servingUnit: UnitType.GRAM,
        nutritionFacts: {
          calories: 345,
          protein: 7.4,
          carbs: 77.9,
          fat: 0.8,
        },
        conversionInfo: {
          nutritionPer100g: {
            calories: 345,
            protein: 7.4,
            carbs: 77.9,
            fat: 0.8,
          },
          servingInfo: {
            size: 1,
            unit: UnitType.PIECE,
            name: '标准碗',
            grams: 150,
          },
          cupInfo: {
            size: 1,
            unit: UnitType.CUP,
            grams: 180,
          },
          cookingConversion: {
            rawToCookedRatio: 2.7,
            cookingMethod: '蒸煮',
            nutritionRetentionRate: 0.95,
          },
          ediblePortion: 100,
        },
      };

      const mealRaw = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: customRice, quantity: 100, unit: UnitType.GRAM }]
      );
      expect(mealRaw.totalNutrition.calories).toBeCloseTo(345, 0);
      expect(mealRaw.totalNutrition.protein).toBeCloseTo(7.4, 1);

      const mealCooked = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.DINNER,
        [{ food: customRice, quantity: 270, unit: UnitType.GRAM, isCooked: true }]
      );
      expect(mealCooked.totalNutrition.calories).toBeCloseTo(327.75, 0);
      expect(mealCooked.totalNutrition.protein).toBeCloseTo(7.03, 1);
    });

    test('should handle serving and cup unit conversions', async () => {
      await sdk.userProfile.createProfile({
        nickname: '单位换算用户',
        gender: Gender.FEMALE,
        birthDate: new Date('1992-01-01').getTime(),
        height: 165,
        heightUnit: UnitType.CENTIMETER,
        weight: 55,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.LIGHT,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: testUserId,
      });

      const customOats = {
        id: 'custom-oats-1',
        name: '即食燕麦片',
        category: '主食',
        servingSize: 100,
        servingUnit: UnitType.GRAM,
        nutritionFacts: {
          calories: 389,
          protein: 16.9,
          carbs: 66.3,
          fat: 6.9,
        },
        conversionInfo: {
          nutritionPer100g: {
            calories: 389,
            protein: 16.9,
            carbs: 66.3,
            fat: 6.9,
          },
          servingInfo: {
            size: 1,
            unit: UnitType.PIECE,
            name: '标准包',
            grams: 40,
          },
          cupInfo: {
            size: 1,
            unit: UnitType.CUP,
            grams: 80,
          },
          ediblePortion: 100,
        },
      };

      const mealByServing = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: customOats, quantity: 1.5, unit: UnitType.PIECE }]
      );
      expect(mealByServing.totalNutrition.calories).toBeCloseTo(389 * 0.6, 0);
      expect(mealByServing.totalNutrition.protein).toBeCloseTo(16.9 * 0.6, 1);

      const mealByCup = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: customOats, quantity: 2, unit: UnitType.CUP }]
      );
      expect(mealByCup.totalNutrition.calories).toBeCloseTo(389 * 1.6, 0);
    });

    test('should apply edible portion deduction correctly', async () => {
      await sdk.userProfile.createProfile({
        nickname: '可食部测试用户',
        gender: Gender.MALE,
        birthDate: new Date('1988-01-01').getTime(),
        height: 180,
        heightUnit: UnitType.CENTIMETER,
        weight: 75,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const customShrimp = {
        id: 'custom-shrimp-1',
        name: '鲜虾',
        category: '海鲜',
        servingSize: 100,
        servingUnit: UnitType.GRAM,
        nutritionFacts: {
          calories: 99,
          protein: 20.9,
          carbs: 0.2,
          fat: 1.7,
        },
        conversionInfo: {
          nutritionPer100g: {
            calories: 99,
            protein: 20.9,
            carbs: 0.2,
            fat: 1.7,
          },
          ediblePortion: 51,
        },
      };

      const meal = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.DINNER,
        [{ food: customShrimp, quantity: 200, unit: UnitType.GRAM }]
      );
      expect(meal.totalNutrition.calories).toBeCloseTo(99 * 1.02, 0);
      expect(meal.totalNutrition.protein).toBeCloseTo(20.9 * 1.02, 1);
    });

    test('should reuse conversion rules in food combinations', async () => {
      await sdk.userProfile.createProfile({
        nickname: '组合复用测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const customEgg = {
        id: 'custom-egg-1',
        name: '鸡蛋',
        category: '蛋类',
        servingSize: 100,
        servingUnit: UnitType.GRAM,
        nutritionFacts: {
          calories: 144,
          protein: 12.8,
          carbs: 1.1,
          fat: 9.9,
        },
        conversionInfo: {
          nutritionPer100g: {
            calories: 144,
            protein: 12.8,
            carbs: 1.1,
            fat: 9.9,
          },
          servingInfo: {
            size: 1,
            unit: UnitType.PIECE,
            name: '个',
            grams: 50,
          },
          ediblePortion: 88,
        },
      };

      const combo = await sdk.mealRecords.createFoodCombination(
        testUserId,
        '健身早餐',
        [
          { food: customEgg, quantity: 2, unit: UnitType.PIECE },
          { food: testFood, quantity: 150, unit: UnitType.GRAM },
        ],
        MealType.BREAKFAST
      );

      const usedMeal = await sdk.mealRecords.useFoodCombination(testUserId, combo.id);
      expect(usedMeal).not.toBeNull();
      expect(usedMeal!.totalNutrition.calories).toBeGreaterThan(0);
      expect(usedMeal!.totalNutrition.protein).toBeGreaterThan(0);

      const eggEntry = usedMeal!.foods.find((f: any) => f.foodId === 'custom-egg-1');
      expect(eggEntry).toBeDefined();
      expect(eggEntry?.normalizedQuantity).toBeCloseTo(100 * 0.88, 0);
    });
  });

  describe('6. Storage Export/Import and Version Migration Tests', () => {
    test('should export and import user data correctly', async () => {
      const storage1 = new InMemoryStorageAdapter({
        useShared: false,
        namespace: 'test-ns-1',
        version: 1,
      });

      const sdk1 = new HealthNutritionSDK({ storageAdapter: storage1 });
      const userId1 = 'export-user-1';

      await sdk1.userProfile.createProfile({
        nickname: '导出测试用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: userId1,
      });

      await sdk1.mealRecords.createMealRecord(
        userId1,
        MealType.LUNCH,
        [{ food: testFood, quantity: 150, unit: UnitType.GRAM }]
      );

      await sdk1.mealRecords.addFavoriteFood(userId1, testFood.id);

      const exported = await storage1.exportData({
        filter: (key) => key.includes(userId1),
      });
      expect(exported.version).toBe(1);
      expect(Object.keys(exported.data).length).toBeGreaterThan(0);

      const storage2 = new InMemoryStorageAdapter({
        useShared: false,
        namespace: 'test-ns-2',
        version: 1,
      });

      const importResult = await storage2.importData(exported);
      expect(importResult.imported).toBeGreaterThan(0);

      const sdk2 = new HealthNutritionSDK({ storageAdapter: storage2 });
      const importedProfile = await sdk2.userProfile.getProfile(userId1);
      expect(importedProfile).toBeDefined();
      expect(importedProfile?.nickname).toBe('导出测试用户');

      const importedFavorites = await sdk2.mealRecords.getFavoriteFoods(userId1);
      expect(importedFavorites.length).toBe(1);
    });

    test('should isolate data between different namespaces', async () => {
      const storageA = new InMemoryStorageAdapter({
        useShared: true,
        namespace: 'app-a',
        version: 1,
      });

      const storageB = new InMemoryStorageAdapter({
        useShared: true,
        namespace: 'app-b',
        version: 1,
      });

      const sdkA = new HealthNutritionSDK({ storageAdapter: storageA });
      const sdkB = new HealthNutritionSDK({ storageAdapter: storageB });

      const userA = 'user-app-a';
      const userB = 'user-app-b';

      await sdkA.userProfile.createProfile({
        nickname: '应用A用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: userA,
      });

      await sdkB.userProfile.createProfile({
        nickname: '应用B用户',
        gender: Gender.FEMALE,
        birthDate: new Date('1992-01-01').getTime(),
        height: 165,
        heightUnit: UnitType.CENTIMETER,
        weight: 55,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.LIGHT,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: userB,
      });

      const profileA = await sdkA.userProfile.getProfile(userA);
      const profileB = await sdkB.userProfile.getProfile(userB);

      expect(profileA?.nickname).toBe('应用A用户');
      expect(profileB?.nickname).toBe('应用B用户');

      const nonExistentInB = await sdkB.userProfile.getProfile(userA);
      expect(nonExistentInB).toBeNull();
    });

    test('should migrate data from old version to new version', async () => {
      InMemoryStorageAdapter.registerMigration('migrate-test', 1, (key, value) => {
        if (key.startsWith('profile:')) {
          return {
            key,
            value: {
              ...value,
              migrated: true,
              schemaVersion: 2,
            },
          };
        }
        return { key, value };
      });

      const storageV1 = new InMemoryStorageAdapter({
        useShared: true,
        namespace: 'migrate-test',
        version: 1,
      });

      const sdkV1 = new HealthNutritionSDK({ storageAdapter: storageV1 });
      const migrateUserId = 'migrate-user-1';

      await sdkV1.userProfile.createProfile({
        nickname: '迁移测试用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: migrateUserId,
      });

      const oldProfile = await sdkV1.userProfile.getProfile(migrateUserId);
      expect(oldProfile).toBeDefined();

      const storageV2 = new InMemoryStorageAdapter({
        useShared: true,
        namespace: 'migrate-test',
        version: 2,
      });

      const sdkV2 = new HealthNutritionSDK({ storageAdapter: storageV2 });
      const migratedProfile = await sdkV2.userProfile.getProfile(migrateUserId);
      expect(migratedProfile).toBeDefined();
      expect(migratedProfile?.nickname).toBe('迁移测试用户');
      expect((migratedProfile as any)?.schemaVersion).toBe(2);
      expect((migratedProfile as any)?.migrated).toBe(true);
    });

    test('should isolate data between multiple users in same adapter', async () => {
      const storage = new InMemoryStorageAdapter({
        useShared: false,
        namespace: 'multi-user',
        version: 1,
      });

      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      const user1 = 'multi-user-1';
      const user2 = 'multi-user-2';

      await sdk.userProfile.createProfile({
        nickname: '用户一',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: user1,
      });

      await sdk.userProfile.createProfile({
        nickname: '用户二',
        gender: Gender.FEMALE,
        birthDate: new Date('1992-01-01').getTime(),
        height: 165,
        heightUnit: UnitType.CENTIMETER,
        weight: 55,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.LIGHT,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: user2,
      });

      await sdk.mealRecords.addFavoriteFood(user1, testFood.id);
      await sdk.mealRecords.addFavoriteFood(user2, riceFood.id);

      const user1Favorites = await sdk.mealRecords.getFavoriteFoods(user1);
      const user2Favorites = await sdk.mealRecords.getFavoriteFoods(user2);

      expect(user1Favorites[0]).toBe('adv-food-1');
      expect(user2Favorites[0]).toBe('adv-food-2');

      const user1Keys = await storage.getUserKeys(user1);
      const user2Keys = await storage.getUserKeys(user2);
      expect(user1Keys.length).toBeGreaterThan(0);
      expect(user2Keys.length).toBeGreaterThan(0);

      await storage.clearUserData(user1);
      const user1AfterClear = await sdk.userProfile.getProfile(user1);
      const user2AfterClear = await sdk.userProfile.getProfile(user2);

      expect(user1AfterClear).toBeNull();
      expect(user2AfterClear).toBeDefined();
    });
  });

  describe('7. Trend Analysis and Health Score Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'trend-user-1';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    const generateTestData = async (days: number, startDaysAgo: number, calorieBase: number, weightBase: number) => {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      for (let i = 0; i < days; i++) {
        const recordDate = now - (startDaysAgo + i) * dayMs;

        const modifiedFood = {
          ...testFood,
          nutritionFacts: {
            ...testFood.nutritionFacts,
            calories: Math.round(calorieBase * 0.3 / 1.65),
            protein: Math.round(calorieBase * 0.3 * 0.3 / 4 / 1.65),
          },
        };

        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.BREAKFAST,
          [{ food: modifiedFood, quantity: 100, unit: UnitType.GRAM }],
          { timestamp: recordDate + 8 * 60 * 60 * 1000 }
        );

        const lunchFood = {
          ...testFood,
          nutritionFacts: {
            ...testFood.nutritionFacts,
            calories: Math.round(calorieBase * 0.4 / 2.475),
            protein: Math.round(calorieBase * 0.4 * 0.3 / 4 / 2.475),
          },
        };

        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.LUNCH,
          [{ food: lunchFood, quantity: 150, unit: UnitType.GRAM }],
          { timestamp: recordDate + 12 * 60 * 60 * 1000 }
        );

        const dinnerFood = {
          ...testFood,
          nutritionFacts: {
            ...testFood.nutritionFacts,
            calories: Math.round(calorieBase * 0.3 / 1.98),
            protein: Math.round(calorieBase * 0.3 * 0.3 / 4 / 1.98),
          },
        };

        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.DINNER,
          [{ food: dinnerFood, quantity: 120, unit: UnitType.GRAM }],
          { timestamp: recordDate + 18 * 60 * 60 * 1000 }
        );

        await sdk.mealRecords.recordWater(
          testUserId,
          2000,
          UnitType.MILLILITER,
          { timestamp: recordDate + 12 * 60 * 60 * 1000 }
        );

        await sdk.mealRecords.recordWeight(
          testUserId,
          weightBase - i * 0.1,
          UnitType.KILOGRAM,
          { timestamp: recordDate + 9 * 60 * 60 * 1000 }
        );
      }
    };

    test('should analyze trend with complete 14-day data', async () => {
      await sdk.userProfile.createProfile({
        nickname: '趋势分析用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 75,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(
        await sdk.userProfile.getProfile(testUserId) as any
      );

      await generateTestData(7, 7, 2200, 78);
      await generateTestData(7, 0, 2000, 73);

      const trend = await sdk.analyzeTrend(testUserId);

      expect(trend).toBeDefined();
      expect(trend!.period.currentStart).toBeLessThan(trend!.period.currentEnd);
      expect(trend!.calories.direction).toBe('down');
      expect(trend!.calories.changePercent).toBeLessThan(0);
      expect(trend!.weight.direction).toBe('down');
      expect(trend!.healthScore.total).toBeGreaterThanOrEqual(0);
      expect(trend!.healthScore.total).toBeLessThanOrEqual(100);
      expect(trend!.healthScore.nutrition).toBeGreaterThan(0);
      expect(trend!.healthScore.water).toBeGreaterThan(0);
      expect(trend!.healthScore.weight).toBeGreaterThan(0);
      expect(trend!.healthScore.consistency).toBeGreaterThan(0);
      expect(trend!.insights.length).toBeGreaterThan(0);
    });

    test('should handle empty data gracefully without division errors', async () => {
      await sdk.userProfile.createProfile({
        nickname: '空数据用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(
        await sdk.userProfile.getProfile(testUserId) as any
      );

      const trend = await sdk.analyzeTrend(testUserId);

      expect(trend).toBeDefined();
      expect(trend!.calories.direction).toBe('stable');
      expect(trend!.calories.currentValue).toBe(0);
      expect(trend!.calories.previousValue).toBe(0);
      expect(trend!.protein.currentValue).toBe(0);
      expect(trend!.water.currentValue).toBe(0);
      expect(trend!.weight.currentValue).toBe(0);
      expect(trend!.healthScore.total).toBeGreaterThanOrEqual(0);
      expect(trend!.healthScore.nutrition).toBeGreaterThanOrEqual(0);
      expect(trend!.healthScore.water).toBeGreaterThanOrEqual(0);
      expect(trend!.healthScore.weight).toBeGreaterThanOrEqual(0);
      expect(trend!.healthScore.consistency).toBe(0);
    });

    test('should analyze trend with partial data', async () => {
      await sdk.userProfile.createProfile({
        nickname: '部分数据用户',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      await sdk.goalCalculation.generateGoals(
        await sdk.userProfile.getProfile(testUserId) as any
      );

      await generateTestData(3, 2, 2000, 70);

      const trend = await sdk.analyzeTrend(testUserId);

      expect(trend).toBeDefined();
      expect(trend!.calories.currentValue).toBeGreaterThan(0);
      expect(trend!.calories.previousValue).toBe(0);
      expect(trend!.calories.direction).toBe('up');
      expect(trend!.healthScore.consistency).toBeGreaterThan(0);
    });
  });

  describe('8. Bug Fixes Verification Tests', () => {
    let sdk: HealthNutritionSDK;
    const testUserId = 'bugfix-user-1';

    beforeEach(() => {
      sdk = new HealthNutritionSDK();
    });

    test('should not amplify nutrition when serving size is 1kg', async () => {
      await sdk.userProfile.createProfile({
        nickname: 'kg单位测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
      });

      const foodWithKgServing = {
        id: 'kg-food-1',
        name: '大包牛肉',
        category: '肉类',
        servingSize: 1,
        servingUnit: UnitType.KILOGRAM,
        nutritionFacts: {
          calories: 2500,
          protein: 200,
          carbs: 0,
          fat: 150,
        },
      };

      const meal = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: foodWithKgServing, quantity: 100, unit: UnitType.GRAM }]
      );

      expect(meal.totalNutrition.calories).toBeCloseTo(250, 0);
      expect(meal.totalNutrition.protein).toBeCloseTo(20, 0);
      expect(meal.totalNutrition.fat).toBeCloseTo(15, 0);
    });

    test('should not amplify nutrition when serving size is 1cup', async () => {
      await sdk.userProfile.createProfile({
        nickname: 'cup单位测试',
        gender: Gender.FEMALE,
        birthDate: new Date('1992-01-01').getTime(),
        height: 165,
        heightUnit: UnitType.CENTIMETER,
        weight: 55,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.LIGHT,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: testUserId,
      });

      const foodWithCupServing = {
        id: 'cup-food-1',
        name: '杯装燕麦',
        category: '主食',
        servingSize: 1,
        servingUnit: UnitType.CUP,
        nutritionFacts: {
          calories: 300,
          protein: 12,
          carbs: 54,
          fat: 5,
        },
        cupInfo: {
          gramsPerCup: 80,
        },
      };

      const meal100g = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.BREAKFAST,
        [{ food: foodWithCupServing, quantity: 100, unit: UnitType.GRAM }]
      );

      expect(meal100g.totalNutrition.calories).toBeCloseTo(375, 0);

      const meal40g = await sdk.mealRecords.createMealRecord(
        testUserId,
        MealType.LUNCH,
        [{ food: foodWithCupServing, quantity: 40, unit: UnitType.GRAM }]
      );

      expect(meal40g.totalNutrition.calories).toBeCloseTo(150, 0);
      expect(meal40g.totalNutrition.protein).toBeCloseTo(6, 0);
    });

    test('should desensitize monthly report correctly', async () => {
      await sdk.userProfile.createProfile({
        nickname: '月报脱敏测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.MAINTAIN,
        userId: testUserId,
        allergies: [AllergenType.PEANUT, AllergenType.SHELLFISH],
        medicalConditions: ['高血压'],
      });

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      for (let i = 0; i < 30; i++) {
        const recordDate = now - i * dayMs;
        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.LUNCH,
          [{ food: testFood, quantity: 150, unit: UnitType.GRAM }],
          { timestamp: recordDate + 12 * 60 * 60 * 1000 }
        );

        await sdk.mealRecords.recordWeight(
          testUserId,
          70 - i * 0.05,
          UnitType.KILOGRAM,
          { timestamp: recordDate + 9 * 60 * 60 * 1000 }
        );
      }

      await sdk.goalCalculation.generateGoals(
        await sdk.userProfile.getProfile(testUserId) as any
      );

      const monthlyReport = await sdk.generateMonthlyReport(testUserId, 0);
      expect(monthlyReport).toBeDefined();

      const desensitizedJson = await sdk.exportDesensitizedReport(monthlyReport!, 'json');
      const parsed = JSON.parse(desensitizedJson);

      expect(parsed.userId).not.toBe(testUserId);
      expect(parsed.summary).toBeDefined();
      expect(parsed.suggestions).toBeDefined();
      expect(parsed.suggestions.length).toBeGreaterThan(0);

      const normalJson = await sdk.exportReport(monthlyReport!, 'json');
      const normalParsed = JSON.parse(normalJson);
      expect(normalParsed.userId).toBe(testUserId);
    });

    test('should mask exact weight values in desensitized text reports', async () => {
      await sdk.userProfile.createProfile({
        nickname: '体重脱敏测试',
        gender: Gender.MALE,
        birthDate: new Date('1990-01-01').getTime(),
        height: 175,
        heightUnit: UnitType.CENTIMETER,
        weight: 70.5,
        weightUnit: UnitType.KILOGRAM,
        activityLevel: ActivityLevel.MODERATE,
        dietGoal: DietGoal.LOSE_WEIGHT,
        userId: testUserId,
      });

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      for (let i = 0; i < 14; i++) {
        const recordDate = now - i * dayMs;
        await sdk.mealRecords.createMealRecord(
          testUserId,
          MealType.LUNCH,
          [{ food: testFood, quantity: 150, unit: UnitType.GRAM }],
          { timestamp: recordDate + 12 * 60 * 60 * 1000 }
        );

        await sdk.mealRecords.recordWeight(
          testUserId,
          70.5 - i * 0.1,
          UnitType.KILOGRAM,
          { timestamp: recordDate + 9 * 60 * 60 * 1000 }
        );
      }

      await sdk.goalCalculation.generateGoals(
        await sdk.userProfile.getProfile(testUserId) as any
      );

      const weeklyReport = await sdk.generateWeeklyReport(testUserId, 0);
      const desensitizedText = await sdk.exportDesensitizedReport(weeklyReport!, 'text');

      expect(desensitizedText).not.toContain('70.5');
      expect(desensitizedText).not.toContain('69.8');
      expect(desensitizedText).not.toMatch(/[\d.]+kg/);
      expect(desensitizedText).not.toMatch(/体重增加[\d.]+/);
      expect(desensitizedText).not.toMatch(/体重减少[\d.]+/);
      expect(desensitizedText).toContain('XXkg');

      const desensitizedJson = await sdk.exportDesensitizedReport(weeklyReport!, 'json');
      const parsed = JSON.parse(desensitizedJson);
      
      expect(parsed.weightChange.toString()).not.toMatch(/^[0-9]+\.[0-9]{2,}$/);
      expect(parsed.weightTrend?.startWeight).not.toBeDefined();
      expect(parsed.weightTrend?.endWeight).not.toBeDefined();
    });
  });
});
