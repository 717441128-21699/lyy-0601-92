import {
  HealthNutritionSDK,
  InMemoryStorageAdapter,
  validateMealFoodEntry,
  validateWaterRecord,
  validateWeightRecord,
  DEFAULT_DATA_QUALITY_CONFIG,
  createDesensitizedWeightInfo,
  calculateFoodNutrition,
  desensitizeReport,
} from '../src/index';
import {
  Gender,
  ActivityLevel,
  DietGoal,
  UnitType,
  MealType,
  ValidationErrorCode,
} from '../src/types';

describe('Data Governance & Quality Tests', () => {
  const chickenFood = {
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

  const riceFood = {
    id: 'food-2',
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

  const milkWithCupInfo = {
    id: 'food-milk',
    name: '牛奶',
    category: '乳制品',
    servingSize: 100,
    servingUnit: UnitType.GRAM,
    nutritionFacts: {
      calories: 54,
      protein: 3.2,
      carbs: 5,
      fat: 3.2,
    },
    conversionInfo: {
      nutritionPer100g: {
        calories: 54,
        protein: 3.2,
        carbs: 5,
        fat: 3.2,
      },
      cupInfo: {
        size: 1,
        unit: UnitType.CUP,
        grams: 250,
        description: '标准杯',
      },
      ediblePortion: 100,
    },
  };

  const flourLegacyCup = {
    id: 'food-flour',
    name: '面粉',
    category: '主食',
    servingSize: 100,
    servingUnit: UnitType.GRAM,
    nutritionFacts: {
      calories: 364,
      protein: 10.3,
      carbs: 76.3,
      fat: 1,
    },
    cupInfo: {
      gramsPerCup: 120,
    },
  };

  const createTestProfile = (userId: string) => ({
    userId,
    name: 'Test User',
    gender: Gender.MALE,
    age: 25,
    height: 175,
    weight: 70,
    activityLevel: ActivityLevel.MODERATE,
    dietGoal: DietGoal.MAINTAIN,
  });

  beforeAll(() => {
    InMemoryStorageAdapter.clearShared();
  });

  afterEach(() => {
    InMemoryStorageAdapter.clearShared();
  });

  describe('Data Quality Validation', () => {
    it('should validate meal food entry with correct data', () => {
      const result = validateMealFoodEntry(chickenFood, 150, UnitType.GRAM);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should detect invalid unit for meal entry', () => {
      const result = validateMealFoodEntry(chickenFood, 1, 'invalid_unit' as any);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_UNIT')).toBe(true);
    });

    it('should detect zero or negative quantity', () => {
      const result = validateMealFoodEntry(chickenFood, 0, UnitType.GRAM);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_QUANTITY')).toBe(true);
      expect(result.errors[0].suggestion).toBeDefined();
    });

    it('should detect extreme quantity', () => {
      const result = validateMealFoodEntry(chickenFood, 99999, UnitType.GRAM);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_QUANTITY')).toBe(true);
    });

    it('should detect future timestamp', () => {
      const futureDate = Date.now() + 10 * 24 * 60 * 60 * 1000;
      const result = validateWeightRecord(70, UnitType.KILOGRAM, {
        timestamp: futureDate,
        config: { maxFutureDays: 1 },
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_TIMESTAMP')).toBe(true);
    });

    it('should detect past timestamp beyond limit', () => {
      const pastDate = Date.now() - 400 * 24 * 60 * 60 * 1000;
      const result = validateWeightRecord(70, UnitType.KILOGRAM, {
        timestamp: pastDate,
        config: { maxPastDays: 365 },
      });
      expect(result.isValid).toBe(false);
    });

    it('should validate water record with correct data', () => {
      const result = validateWaterRecord(500, UnitType.MILLILITER);
      expect(result.isValid).toBe(true);
    });

    it('should detect invalid water amount', () => {
      const result = validateWaterRecord(-100, UnitType.MILLILITER);
      expect(result.isValid).toBe(false);
      expect(result.errors[0].suggestedValue).toBeDefined();
    });

    it('should detect extreme weight value', () => {
      const result = validateWeightRecord(500, UnitType.KILOGRAM);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_QUANTITY')).toBe(true);
    });

    it('should auto correct warnings when configured', () => {
      const result = validateMealFoodEntry(chickenFood, 0.05, UnitType.KILOGRAM, {
        autoCorrectWarnings: true,
      });
      expect(result.correctedData).toBeDefined();
    });

    it('should detect invalid nutrition values', () => {
      const badFood = {
        ...chickenFood,
        nutritionFacts: {
          ...chickenFood.nutritionFacts,
          calories: -100,
          protein: 200,
        },
      };
      const result = validateMealFoodEntry(badFood, 100, UnitType.GRAM);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_NUTRITION_VALUE')).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    it('should batch create meal records with validation', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'batch-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const result = await sdk.mealRecords.batchCreateMealRecords('user1', [
        {
          mealType: MealType.BREAKFAST,
          foods: [{ food: chickenFood, quantity: 100, unit: UnitType.GRAM }],
        },
        {
          mealType: MealType.LUNCH,
          foods: [
            { food: chickenFood, quantity: 150, unit: UnitType.GRAM },
            { food: riceFood, quantity: 200, unit: UnitType.GRAM },
          ],
        },
        {
          mealType: MealType.DINNER,
          foods: [{ food: chickenFood, quantity: -50, unit: UnitType.GRAM }],
        },
      ]);

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results.length).toBe(3);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[2].valid).toBe(false);
    });

    it('should batch record water with validation', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'batch-test2' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const result = await sdk.mealRecords.batchRecordWater('user1', [
        { amount: 250, unit: UnitType.MILLILITER },
        { amount: 500, unit: UnitType.MILLILITER },
        { amount: -100, unit: UnitType.MILLILITER },
        { amount: 1000, unit: UnitType.MILLILITER },
      ]);

      expect(result.totalCount).toBe(4);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(1);
    });

    it('should batch record weight with validation', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'batch-test3' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const result = await sdk.mealRecords.batchRecordWeight('user1', [
        { weight: 70.5, unit: UnitType.KILOGRAM },
        { weight: 70.3, unit: UnitType.KILOGRAM },
        { weight: 1000, unit: UnitType.KILOGRAM },
      ]);

      expect(result.totalCount).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });
  });

  describe('Cup Unit Handling', () => {
    it('should use food cupInfo.grams for 1 cup entry', () => {
      const result = calculateFoodNutrition(milkWithCupInfo, 1, UnitType.CUP);
      expect(result.normalizedQuantityGrams).toBe(250);
      expect(result.nutrition.calories).toBeCloseTo(135, 0);
    });

    it('should use legacy cupInfo.gramsPerCup for 1 cup entry', () => {
      const result = calculateFoodNutrition(flourLegacyCup, 1, UnitType.CUP);
      expect(result.normalizedQuantityGrams).toBe(120);
      expect(result.nutrition.calories).toBeCloseTo(436.8, 0);
    });

    it('should not use default 240g when food has own cup weight', () => {
      const resultWithCupInfo = calculateFoodNutrition(milkWithCupInfo, 1, UnitType.CUP);
      expect(resultWithCupInfo.normalizedQuantityGrams).not.toBe(240);
      expect(resultWithCupInfo.normalizedQuantityGrams).toBe(250);
    });

    it('should use default 240g only when no cupInfo available', () => {
      const resultNoCupInfo = calculateFoodNutrition(chickenFood, 1, UnitType.CUP);
      expect(resultNoCupInfo.normalizedQuantityGrams).toBe(240);
    });

    it('should calculate correctly for partial cups', () => {
      const result = calculateFoodNutrition(milkWithCupInfo, 0.5, UnitType.CUP);
      expect(result.normalizedQuantityGrams).toBe(125);
      expect(result.nutrition.calories).toBeCloseTo(67.5, 0);
    });

    it('should calculate correctly for multiple cups', () => {
      const result = calculateFoodNutrition(milkWithCupInfo, 2, UnitType.CUP);
      expect(result.normalizedQuantityGrams).toBe(500);
      expect(result.nutrition.calories).toBeCloseTo(270, 0);
    });
  });

  describe('Incremental Export & Conflict Merge', () => {
    it('should support incremental export by timestamp', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'sync-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ]);

      const firstExport = await storage.exportData();
      expect(firstExport.count).toBeGreaterThan(0);

      await new Promise(resolve => setTimeout(resolve, 100));
      const afterFirstExport = Date.now();

      await sdk.mealRecords.createMealRecord('user1', MealType.LUNCH, [
        { food: riceFood, quantity: 150, unit: UnitType.GRAM },
      ]);

      const incrementalExport = await storage.exportData({
        sinceTimestamp: afterFirstExport,
      });

      expect(incrementalExport.isIncremental).toBe(true);
      expect(incrementalExport.count).toBeLessThan(firstExport.count);
      expect(incrementalExport.timestamps).toBeDefined();
    });

    it('should support last_write_wins conflict resolution', async () => {
      const storage1 = new InMemoryStorageAdapter({ useShared: true, namespace: 'merge-test' });
      const sdk1 = new HealthNutritionSDK({ storageAdapter: storage1 });

      await sdk1.userProfile.createProfile(createTestProfile('user1'));

      const meal1 = await sdk1.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ]);

      const exportData = await storage1.exportData();

      await new Promise(resolve => setTimeout(resolve, 50));
      await sdk1.mealRecords.recordWater('user1', 300, UnitType.MILLILITER);

      const result = await storage1.importData(exportData, {
        conflictResolution: 'last_write_wins',
      });

      expect(result.conflicts).toBeDefined();
      expect(result.imported).toBeGreaterThan(0);
    });

    it('should support merge_by_timestamp conflict resolution', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'merge-test2' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const meal = await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ]);

      const exportData = await storage.exportData();

      const modifiedExport = {
        ...exportData,
        data: {
          ...exportData.data,
          [`meal:user1:${meal.id}`]: {
            ...meal,
            notes: 'Modified on device 2',
          },
        },
      };

      const result = await storage.importData(modifiedExport, {
        conflictResolution: 'merge_by_timestamp',
      });

      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should support rollback by token', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'rollback-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const token = await storage.createRollbackSnapshot('user1');
      expect(token).toBeDefined();

      await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ]);

      const mealsAfterAdd = await sdk.mealRecords.getMealsByDate('user1', Date.now());
      expect(mealsAfterAdd.length).toBe(1);

      const rollbackResult = await storage.rollback(token);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.restoredCount).toBeGreaterThan(0);
    });

    it('should support rollback user data to timestamp', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'rollback-test2' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const afterProfileCreation = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));

      await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ]);

      const result = await storage.rollbackUserData('user1', afterProfileCreation);
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBeGreaterThan(0);
    });

    it('should list rollback snapshots', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'rollback-test3' });
      
      await storage.createRollbackSnapshot('user1');
      await new Promise(resolve => setTimeout(resolve, 50));
      await storage.createRollbackSnapshot('user2');

      const snapshots = await storage.listRollbackSnapshots();
      expect(snapshots.length).toBe(2);

      const user1Snapshots = await storage.listRollbackSnapshots('user1');
      expect(user1Snapshots.length).toBe(1);
    });

    it('should support dry run import', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'dryrun-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const exportData = await storage.exportData();
      const keysBefore = await storage.getUserKeys('user1');

      const result = await storage.importData(exportData, {
        dryRun: true,
        overwrite: true,
      });

      const keysAfter = await storage.getUserKeys('user1');
      expect(keysAfter.length).toBe(keysBefore.length);
      expect(result.imported).toBeGreaterThan(0);
      expect(result.rollbackToken).toBeUndefined();
    });
  });

  describe('Goal Execution Analysis', () => {
    it('should analyze goal execution with sufficient data', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'analysis-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile({
        ...createTestProfile('user1'),
        dietGoal: DietGoal.LOSE_WEIGHT,
      });

      const profile = await sdk.userProfile.getProfile('user1');
      await sdk.goalCalculation.generateGoals(profile!);

      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        const dayOffset = 12 - i;
        const timestamp = now - dayOffset * 24 * 60 * 60 * 1000;
        
        await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
          { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
        ], { timestamp });
        
        await sdk.mealRecords.createMealRecord('user1', MealType.LUNCH, [
          { food: chickenFood, quantity: 120, unit: UnitType.GRAM },
          { food: riceFood, quantity: 150, unit: UnitType.GRAM },
        ], { timestamp });
        
        await sdk.mealRecords.createMealRecord('user1', MealType.DINNER, [
          { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
          { food: riceFood, quantity: 100, unit: UnitType.GRAM },
        ], { timestamp });

        await sdk.mealRecords.recordWater('user1', 2500, UnitType.MILLILITER, { timestamp });
        
        if (i % 2 === 0) {
          await sdk.mealRecords.recordWeight('user1', 70 - i * 0.1, UnitType.KILOGRAM, { timestamp });
        }
      }

      const goals = await sdk.goalCalculation.getGoals('user1');
      const meals = await sdk.mealRecords.getMealsByDateRange('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const weights = await sdk.mealRecords.getWeightRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const waters = await sdk.mealRecords.getWaterRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);

      const analysis = await sdk.reportGeneration.analyzeGoalExecution(
        'user1',
        profile!,
        goals!,
        meals,
        weights,
        waters
      );

      expect(analysis.overallScore).toBeGreaterThan(0);
      expect(analysis.period.days).toBe(14);
      expect(analysis.checkInAnalysis.checkInDays).toBe(10);
      expect(analysis.insights.length).toBeGreaterThan(0);
      expect(analysis.summary).toBeDefined();
      expect(analysis.personalizedRecommendations.length).toBeGreaterThan(0);
    });

    it('should handle empty data gracefully', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'analysis-test2' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const profile = await sdk.userProfile.getProfile('user1');
      await sdk.goalCalculation.generateGoals(profile!);
      const goals = await sdk.goalCalculation.getGoals('user1');

      const analysis = await sdk.reportGeneration.analyzeGoalExecution(
        'user1',
        profile!,
        goals!,
        [],
        [],
        []
      );

      expect(analysis.overallScore).toBe(0);
      expect(analysis.checkInAnalysis.score).toBe(0);
      expect(analysis.calorieAnalysis.score).toBe(0);
      expect(analysis.waterAnalysis.score).toBe(0);
      expect(analysis.weightAnalysis.score).toBe(0);
      expect(analysis.insights[0].type).toBe('info');
      expect(analysis.summary).toContain('开始记录');
    });

    it('should generate streak insights for consecutive check-ins', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'analysis-test3' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const profile = await sdk.userProfile.getProfile('user1');
      await sdk.goalCalculation.generateGoals(profile!);
      const goals = await sdk.goalCalculation.getGoals('user1');

      const now = Date.now();
      for (let i = 0; i < 8; i++) {
        const timestamp = now - i * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
          { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
        ], { timestamp });
      }

      const meals = await sdk.mealRecords.getMealsByDateRange('user1', now - 14 * 24 * 60 * 60 * 1000, now);

      const analysis = await sdk.reportGeneration.analyzeGoalExecution(
        'user1',
        profile!,
        goals!,
        meals,
        [],
        []
      );

      expect(analysis.checkInAnalysis.currentStreak).toBeGreaterThanOrEqual(7);
      expect(analysis.insights.some(i => i.title.includes('连续打卡'))).toBe(true);
    });
  });

  describe('Desensitized Weight Info', () => {
    it('should create desensitized weight info for weight loss', () => {
      const result = createDesensitizedWeightInfo(-2.5, 75, 72.5, 14, 'down');
      expect(result.trend).toBe('significant_loss');
      expect(result.direction).toBe('down');
      expect(result.description).not.toContain('2.5');
      expect(result.description).not.toContain('75');
      expect(result.description).not.toContain('72.5');
      expect(result.changeCategory).toBe('significant');
    });

    it('should create desensitized weight info for weight gain', () => {
      const result = createDesensitizedWeightInfo(1.2, 65, 66.2, 14, 'up');
      expect(result.trend).toBe('moderate_gain');
      expect(result.direction).toBe('up');
      expect(result.description).not.toContain('1.2');
      expect(result.changeCategory).toBe('moderate');
    });

    it('should create desensitized weight info for stable weight', () => {
      const result = createDesensitizedWeightInfo(0.3, 70, 70.3, 14, 'stable');
      expect(result.trend).toBe('maintaining_stable');
      expect(result.direction).toBe('stable');
      expect(result.changeCategory).toBe('small');
    });

    it('should include desensitized info in desensitized report', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'desensitize-test' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile({
        ...createTestProfile('user1'),
        dietGoal: DietGoal.LOSE_WEIGHT,
      });

      const profile = await sdk.userProfile.getProfile('user1');
      await sdk.goalCalculation.generateGoals(profile!);

      const now = Date.now();
      for (let i = 0; i < 14; i++) {
        const timestamp = now - (13 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.recordWeight('user1', 70 - i * 0.15, UnitType.KILOGRAM, { timestamp });
      }

      const goals = await sdk.goalCalculation.getGoals('user1');
      const meals = await sdk.mealRecords.getMealsByDateRange('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const weights = await sdk.mealRecords.getWeightRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const waters = await sdk.mealRecords.getWaterRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);

      const trendAnalysis = await sdk.reportGeneration.analyzeTrend('user1', meals, weights, waters, goals!);
      const desensitized = desensitizeReport(trendAnalysis, { maskWeight: true });

      expect(desensitized.desensitizedWeightInfo).toBeDefined();
      expect(desensitized.desensitizedWeightInfo.trend).toBeDefined();
      expect(desensitized.desensitizedWeightInfo.direction).toBeDefined();
      expect(desensitized.desensitizedWeightInfo.description).toBeDefined();
      
      if (desensitized.weightTrend) {
        expect(typeof desensitized.weightTrend).toBe('object');
        expect(desensitized.weightTrend.direction).toBe('down');
        expect(desensitized.weightTrend.description).toBeDefined();
      }
      
      if (desensitized.weeklyComparison) {
        expect(typeof desensitized.weeklyComparison.currentWeek.averageWeight).toBe('object');
        expect(desensitized.weeklyComparison.currentWeek.averageWeight.description).toBeDefined();
        expect(desensitized.weeklyComparison.currentWeek.averageWeight.description).not.toMatch(/[\d.]+/);
      }
    });

    it('should include desensitized info in goal execution analysis', async () => {
      const storage = new InMemoryStorageAdapter({ useShared: true, namespace: 'desensitize-test2' });
      const sdk = new HealthNutritionSDK({ storageAdapter: storage });

      await sdk.userProfile.createProfile({
        ...createTestProfile('user1'),
        dietGoal: DietGoal.LOSE_WEIGHT,
        weight: 75,
      });

      const profile = await sdk.userProfile.getProfile('user1');
      await sdk.goalCalculation.generateGoals(profile!);
      const goals = await sdk.goalCalculation.getGoals('user1');

      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        const timestamp = now - (9 - i) * 24 * 60 * 60 * 1000;
        await sdk.mealRecords.recordWeight('user1', 75 - i * 0.2, UnitType.KILOGRAM, { timestamp });
        await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
          { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
        ], { timestamp });
        await sdk.mealRecords.recordWater('user1', 2000, UnitType.MILLILITER, { timestamp });
      }

      const meals = await sdk.mealRecords.getMealsByDateRange('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const weights = await sdk.mealRecords.getWeightRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);
      const waters = await sdk.mealRecords.getWaterRecords('user1', now - 14 * 24 * 60 * 60 * 1000, now);

      const analysis = await sdk.reportGeneration.analyzeGoalExecution(
        'user1',
        profile!,
        goals!,
        meals,
        weights,
        waters
      );

      expect(analysis.weightAnalysis.desensitizedInfo).toBeDefined();
      expect(analysis.weightAnalysis.desensitizedInfo.trend).toBe('moderate_loss');
      expect(analysis.weightAnalysis.desensitizedInfo.direction).toBe('down');
      expect(analysis.weightAnalysis.desensitizedInfo.description).not.toContain('75');
      expect(analysis.weightAnalysis.desensitizedInfo.description).not.toContain('73');
    });
  });

  describe('SDK Config Integration', () => {
    it('should use custom data quality config', async () => {
      const customConfig = {
        ...DEFAULT_DATA_QUALITY_CONFIG,
        maxFutureDays: 7,
        maxPastDays: 30,
        minQuantity: 1,
        maxQuantity: 5000,
      };

      const sdk = new HealthNutritionSDK({
        dataQuality: customConfig,
      });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const futureDate = Date.now() + 5 * 24 * 60 * 60 * 1000;
      const result = await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: 100, unit: UnitType.GRAM },
      ], { timestamp: futureDate, validate: true });

      expect(result).toBeDefined();
    });

    it('should reject invalid data when rejectOnError is true', async () => {
      const sdk = new HealthNutritionSDK({
        dataQuality: {
          ...DEFAULT_DATA_QUALITY_CONFIG,
          rejectOnError: true,
        },
      });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      await expect(
        sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
          { food: chickenFood, quantity: -100, unit: UnitType.GRAM },
        ], { validate: true })
      ).rejects.toThrow();
    });

    it('should allow validation to be disabled per call', async () => {
      const sdk = new HealthNutritionSDK({
        dataQuality: {
          ...DEFAULT_DATA_QUALITY_CONFIG,
          rejectOnError: true,
        },
      });

      await sdk.userProfile.createProfile(createTestProfile('user1'));

      const result = await sdk.mealRecords.createMealRecord('user1', MealType.BREAKFAST, [
        { food: chickenFood, quantity: -100, unit: UnitType.GRAM },
      ], { validate: false });

      expect(result).toBeDefined();
    });
  });
});
