import { GoalCalculationManager } from '../src/modules/GoalCalculation';
import { Gender, ActivityLevel, DietGoal, UnitType, UserProfile } from '../src/types';

describe('GoalCalculationManager', () => {
  let manager: GoalCalculationManager;

  beforeEach(() => {
    manager = new GoalCalculationManager();
  });

  const baseProfile: UserProfile = {
    userId: 'user-1',
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
    allergies: [],
    preferences: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  test('should calculate BMR correctly', async () => {
    const result = await manager.calculateBMR(baseProfile);
    expect(result.bmr).toBeGreaterThan(0);
    expect(result.tdee).toBeGreaterThan(result.bmr);
    expect(result.method).toContain('Mifflin');
  });

  test('should calculate daily calories for different goals', async () => {
    const loseWeightProfile = { ...baseProfile, dietGoal: DietGoal.LOSE_WEIGHT };
    const maintainProfile = { ...baseProfile, dietGoal: DietGoal.MAINTAIN };
    const gainWeightProfile = { ...baseProfile, dietGoal: DietGoal.GAIN_WEIGHT };

    const loseResult = await manager.calculateDailyCalories(loseWeightProfile);
    const maintainResult = await manager.calculateDailyCalories(maintainProfile);
    const gainResult = await manager.calculateDailyCalories(gainWeightProfile);

    expect(loseResult.target).toBeLessThan(maintainResult.target);
    expect(gainResult.target).toBeGreaterThan(maintainResult.target);
    expect(loseResult.adjustment).toBe(-500);
    expect(maintainResult.adjustment).toBe(0);
    expect(gainResult.adjustment).toBe(300);
  });

  test('should calculate macronutrient targets', async () => {
    const result = await manager.calculateMacronutrientTargets(2000, baseProfile);
    
    expect(result.protein.grams).toBeGreaterThan(0);
    expect(result.carbs.grams).toBeGreaterThan(0);
    expect(result.fat.grams).toBeGreaterThan(0);
    expect(result.protein.ratio + result.carbs.ratio + result.fat.ratio).toBe(100);
    expect(result.protein.calories + result.carbs.calories + result.fat.calories).toBeCloseTo(2000, 0);
  });

  test('should calculate water goal based on weight and activity', async () => {
    const result = await manager.calculateWaterGoal(baseProfile);
    expect(result.dailyWater).toBeGreaterThan(2000);
    expect(result.cups).toBeGreaterThan(0);
    expect(result.reason).toContain('kg');
  });

  test('should calculate weight goal with timeline', async () => {
    const result = await manager.calculateWeightGoal(baseProfile);
    expect(result.targetWeight).toBe(65);
    expect(result.weeklyChange).toBeLessThan(0);
    expect(result.estimatedWeeks).toBeGreaterThan(0);
    expect(result.targetDate).toBeGreaterThan(Date.now());
  });

  test('should generate complete goals for user', async () => {
    const goals = await manager.generateGoals(baseProfile);
    
    expect(goals).toBeDefined();
    expect(goals.userId).toBe('user-1');
    expect(goals.dailyCalories).toBeGreaterThan(0);
    expect(goals.dailyProtein).toBeGreaterThan(0);
    expect(goals.dailyCarbs).toBeGreaterThan(0);
    expect(goals.dailyFat).toBeGreaterThan(0);
    expect(goals.dailyWater).toBeGreaterThan(0);
    expect(goals.targetWeight).toBe(65);
    expect(goals.macronutrientRatio.protein + goals.macronutrientRatio.carbs + goals.macronutrientRatio.fat).toBe(100);
  });

  test('should generate goals with custom parameters', async () => {
    const goals = await manager.generateGoals(baseProfile, {
      customCalories: 2500,
      customMacronutrientRatio: { protein: 40, carbs: 40, fat: 20 },
      customTargetWeight: 68,
    });

    expect(goals.dailyCalories).toBe(2500);
    expect(goals.macronutrientRatio.protein).toBe(40);
    expect(goals.targetWeight).toBe(68);
  });

  test('should get and update goals', async () => {
    await manager.generateGoals(baseProfile);
    
    const goals = await manager.getGoals('user-1');
    expect(goals).toBeDefined();

    const updated = await manager.updateGoals('user-1', {
      dailyCalories: 1800,
      dailyWater: 2500,
    });

    expect(updated?.dailyCalories).toBe(1800);
    expect(updated?.dailyWater).toBe(2500);
  });

  test('should adjust goals based on progress', async () => {
    await manager.generateGoals(baseProfile);
    
    const result1 = await manager.adjustGoalBasedOnProgress(
      'user-1',
      69.5,
      UnitType.KILOGRAM,
      1700,
      14
    );

    expect(result1).toBeDefined();
    expect(typeof result1.shouldAdjust).toBe('boolean');

    const result2 = await manager.adjustGoalBasedOnProgress(
      'user-1',
      65.5,
      UnitType.KILOGRAM,
      2300,
      14
    );

    expect(result2.shouldAdjust).toBe(true);
  });

  test('should handle different units', async () => {
    const imperialProfile: UserProfile = {
      ...baseProfile,
      weight: 154,
      weightUnit: UnitType.POUND,
      height: 69,
      heightUnit: UnitType.INCH,
    };

    const result = await manager.calculateBMR(imperialProfile);
    expect(result.bmr).toBeGreaterThan(0);

    const goals = await manager.generateGoals(imperialProfile);
    expect(goals.dailyCalories).toBeGreaterThan(0);
  });
});
