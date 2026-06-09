import { MealRecordsManager } from '../src/modules/MealRecords';
import { MealType, UnitType } from '../src/types';

describe('MealRecordsManager', () => {
  let manager: MealRecordsManager;

  beforeEach(() => {
    manager = new MealRecordsManager();
  });

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

  const testFood2 = {
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

  test('should create a meal record', async () => {
    const meal = await manager.createMealRecord(
      'user-1',
      MealType.LUNCH,
      [
        { food: testFood, quantity: 150, unit: UnitType.GRAM },
        { food: testFood2, quantity: 200, unit: UnitType.GRAM },
      ]
    );

    expect(meal).toBeDefined();
    expect(meal.id).toBeDefined();
    expect(meal.mealType).toBe(MealType.LUNCH);
    expect(meal.foods.length).toBe(2);
    expect(meal.totalNutrition.calories).toBeGreaterThan(0);
    expect(meal.totalNutrition.protein).toBeGreaterThan(0);
  });

  test('should calculate nutrition correctly for different quantities', async () => {
    const meal = await manager.createMealRecord(
      'user-1',
      MealType.LUNCH,
      [{ food: testFood, quantity: 200, unit: UnitType.GRAM }]
    );

    expect(meal.totalNutrition.calories).toBeCloseTo(330, 0);
    expect(meal.totalNutrition.protein).toBeCloseTo(62, 0);
  });

  test('should get meals by date range', async () => {
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    await manager.createMealRecord('user-1', MealType.BREAKFAST, [{ food: testFood, quantity: 100, unit: UnitType.GRAM }], { timestamp: yesterday });
    await manager.createMealRecord('user-1', MealType.LUNCH, [{ food: testFood2, quantity: 100, unit: UnitType.GRAM }], { timestamp: now });

    const meals = await manager.getMealsByDateRange('user-1', yesterday, now);
    expect(meals.length).toBe(2);
  });

  test('should record water intake', async () => {
    const record = await manager.recordWater('user-1', 500, UnitType.MILLILITER);
    expect(record).toBeDefined();
    expect(record.amount).toBe(500);

    const today = new Date().getTime();
    const waterIntake = await manager.getWaterIntakeByDate('user-1', today);
    expect(waterIntake.amount).toBeGreaterThanOrEqual(500);
  });

  test('should record weight', async () => {
    const record = await manager.recordWeight('user-1', 70.5, UnitType.KILOGRAM, {
      bodyFat: 18,
      muscleMass: 55,
    });

    expect(record).toBeDefined();
    expect(record.weight).toBe(70.5);
    expect(record.bodyFat).toBe(18);
    expect(record.muscleMass).toBe(55);
  });

  test('should get latest weight', async () => {
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    await manager.recordWeight('user-1', 71, UnitType.KILOGRAM, { timestamp: yesterday });
    await manager.recordWeight('user-1', 70.5, UnitType.KILOGRAM, { timestamp: now });

    const latest = await manager.getLatestWeight('user-1');
    expect(latest?.weight).toBe(70.5);
  });

  test('should manage favorite foods', async () => {
    await manager.addFavoriteFood('user-1', 'food-1');
    const favorites = await manager.getFavoriteFoods('user-1');
    expect(favorites).toContain('food-1');

    const isFavorite = await manager.isFavoriteFood('user-1', 'food-1');
    expect(isFavorite).toBe(true);

    await manager.removeFavoriteFood('user-1', 'food-1');
    const favoritesAfter = await manager.getFavoriteFoods('user-1');
    expect(favoritesAfter).not.toContain('food-1');
  });

  test('should create and use food combinations', async () => {
    const combo = await manager.createFoodCombination(
      'user-1',
      '健身套餐',
      [
        { food: testFood, quantity: 150, unit: UnitType.GRAM },
        { food: testFood2, quantity: 100, unit: UnitType.GRAM },
      ],
      MealType.LUNCH
    );

    expect(combo).toBeDefined();
    expect(combo.name).toBe('健身套餐');
    expect(combo.usageCount).toBe(0);

    const meal = await manager.useFoodCombination('user-1', combo.id);
    expect(meal).toBeDefined();
    expect(meal?.mealType).toBe(MealType.LUNCH);

    const updatedCombo = (await manager.getFoodCombinations('user-1')).find(c => c.id === combo.id);
    expect(updatedCombo?.usageCount).toBe(1);
  });

  test('should get daily nutrition summary', async () => {
    const today = new Date().getTime();
    
    await manager.createMealRecord(
      'user-1',
      MealType.BREAKFAST,
      [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
      { timestamp: today }
    );
    await manager.recordWater('user-1', 250, UnitType.MILLILITER, { timestamp: today });

    const summary = await manager.getDailyNutritionSummary('user-1', today);
    expect(summary.calories).toBe(165);
    expect(summary.protein).toBe(31);
    expect(summary.mealCount).toBe(1);
    expect(summary.waterMl).toBe(250);
  });

  test('should get top foods', async () => {
    const now = Date.now();
    
    for (let i = 0; i < 5; i++) {
      await manager.createMealRecord(
        'user-1',
        MealType.LUNCH,
        [{ food: testFood, quantity: 100, unit: UnitType.GRAM }],
        { timestamp: now - i * 24 * 60 * 60 * 1000 }
      );
    }

    const topFoods = await manager.getTopFoods('user-1', now - 7 * 24 * 60 * 60 * 1000, now, 10);
    expect(topFoods.length).toBeGreaterThan(0);
    expect(topFoods[0].name).toBe('鸡胸肉');
    expect(topFoods[0].count).toBe(5);
  });
});
