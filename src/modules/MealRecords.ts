import {
  MealRecord,
  MealType,
  MealFoodEntry,
  FoodItem,
  WaterRecord,
  WeightRecord,
  FoodCombination,
  UnitType,
  NutritionFacts,
  SDKConfig,
} from '../types';
import {
  generateId,
  getTimestamp,
  calculateNutritionForQuantity,
  sumNutrition,
  getStartOfDay,
  getEndOfDay,
  isSameDay,
  groupBy,
} from '../utils/helpers';

export class MealRecordsManager {
  private config: SDKConfig;
  private meals: Map<string, MealRecord> = new Map();
  private waterRecords: Map<string, WaterRecord> = new Map();
  private weightRecords: Map<string, WeightRecord> = new Map();
  private foodCombinations: Map<string, FoodCombination> = new Map();
  private favorites: Set<string> = new Set();

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async createMealRecord(
    userId: string,
    mealType: MealType,
    foods: { food: FoodItem; quantity: number; unit: UnitType }[],
    options?: { timestamp?: number; notes?: string; mood?: string; location?: string }
  ): Promise<MealRecord> {
    const now = getTimestamp();
    const foodEntries: MealFoodEntry[] = foods.map(({ food, quantity, unit }) => {
      const nutrition = calculateNutritionForQuantity(
        food.nutritionFacts,
        food.servingSize,
        quantity
      );
      return {
        foodId: food.id,
        foodName: food.name,
        quantity,
        unit,
        nutritionFacts: nutrition,
      };
    });

    const totalNutrition = sumNutrition(foodEntries.map(f => f.nutritionFacts));

    const meal: MealRecord = {
      id: generateId(),
      userId,
      mealType,
      timestamp: options?.timestamp || now,
      foods: foodEntries,
      totalNutrition,
      notes: options?.notes,
      mood: options?.mood,
      location: options?.location,
    };

    this.meals.set(meal.id, meal);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`meal:${userId}:${meal.id}`, meal);
    }

    return meal;
  }

  async getMealRecord(userId: string, mealId: string): Promise<MealRecord | null> {
    const cached = this.meals.get(mealId);
    if (cached && cached.userId === userId) return cached;

    if (this.config.storageAdapter) {
      const meal = await this.config.storageAdapter.get<MealRecord>(`meal:${userId}:${mealId}`);
      if (meal) {
        this.meals.set(mealId, meal);
        return meal;
      }
    }

    return null;
  }

  async updateMealRecord(
    userId: string,
    mealId: string,
    updates: {
      foods?: { food: FoodItem; quantity: number; unit: UnitType }[];
      mealType?: MealType;
      timestamp?: number;
      notes?: string;
      mood?: string;
      location?: string;
    }
  ): Promise<MealRecord | null> {
    const meal = await this.getMealRecord(userId, mealId);
    if (!meal) return null;

    let foodEntries = meal.foods;
    let totalNutrition = meal.totalNutrition;

    if (updates.foods) {
      foodEntries = updates.foods.map(({ food, quantity, unit }) => {
        const nutrition = calculateNutritionForQuantity(
          food.nutritionFacts,
          food.servingSize,
          quantity
        );
        return {
          foodId: food.id,
          foodName: food.name,
          quantity,
          unit,
          nutritionFacts: nutrition,
        };
      });
      totalNutrition = sumNutrition(foodEntries.map(f => f.nutritionFacts));
    }

    const updated: MealRecord = {
      ...meal,
      ...updates,
      foods: foodEntries,
      totalNutrition,
    };

    this.meals.set(mealId, updated);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`meal:${userId}:${mealId}`, updated);
    }

    return updated;
  }

  async deleteMealRecord(userId: string, mealId: string): Promise<boolean> {
    this.meals.delete(mealId);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.remove(`meal:${userId}:${mealId}`);
    }

    return true;
  }

  async getMealsByDateRange(
    userId: string,
    startDate: number,
    endDate: number
  ): Promise<MealRecord[]> {
    const meals: MealRecord[] = [];

    for (const meal of this.meals.values()) {
      if (meal.userId === userId && meal.timestamp >= startDate && meal.timestamp <= endDate) {
        meals.push(meal);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<MealRecord>(`meal:${userId}:`);
      const filtered = stored.filter(m => m.timestamp >= startDate && m.timestamp <= endDate);
      
      for (const m of filtered) {
        if (!meals.find(meal => meal.id === m.id)) {
          meals.push(m);
          this.meals.set(m.id, m);
        }
      }
    }

    return meals.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getMealsByDate(userId: string, date: number): Promise<MealRecord[]> {
    const start = getStartOfDay(date);
    const end = getEndOfDay(date);
    return this.getMealsByDateRange(userId, start, end);
  }

  async getMealsByType(userId: string, mealType: MealType, startDate?: number, endDate?: number): Promise<MealRecord[]> {
    let meals = await this.getMealsByDateRange(
      userId,
      startDate || 0,
      endDate || getTimestamp()
    );
    return meals.filter(m => m.mealType === mealType);
  }

  async addFoodToMeal(
    userId: string,
    mealId: string,
    food: FoodItem,
    quantity: number,
    unit: UnitType
  ): Promise<MealRecord | null> {
    const meal = await this.getMealRecord(userId, mealId);
    if (!meal) return null;

    const nutrition = calculateNutritionForQuantity(
      food.nutritionFacts,
      food.servingSize,
      quantity
    );

    const foodEntry: MealFoodEntry = {
      foodId: food.id,
      foodName: food.name,
      quantity,
      unit,
      nutritionFacts: nutrition,
    };

    const updatedFoods = [...meal.foods, foodEntry];
    const totalNutrition = sumNutrition(updatedFoods.map(f => f.nutritionFacts));

    return this.updateMealRecord(userId, mealId, {
      foods: updatedFoods.map(f => ({
        food: {
          id: f.foodId,
          name: f.foodName,
          category: '',
          servingSize: f.quantity,
          servingUnit: f.unit,
          nutritionFacts: f.nutritionFacts,
        } as FoodItem,
        quantity: f.quantity,
        unit: f.unit,
      })),
    });
  }

  async removeFoodFromMeal(
    userId: string,
    mealId: string,
    foodId: string
  ): Promise<MealRecord | null> {
    const meal = await this.getMealRecord(userId, mealId);
    if (!meal) return null;

    const updatedFoods = meal.foods.filter(f => f.foodId !== foodId);

    return this.updateMealRecord(userId, mealId, {
      foods: updatedFoods.map(f => ({
        food: {
          id: f.foodId,
          name: f.foodName,
          category: '',
          servingSize: f.quantity,
          servingUnit: f.unit,
          nutritionFacts: f.nutritionFacts,
        } as FoodItem,
        quantity: f.quantity,
        unit: f.unit,
      })),
    });
  }

  async recordWater(
    userId: string,
    amount: number,
    unit: UnitType = UnitType.MILLILITER,
    options?: { timestamp?: number; cupSize?: number }
  ): Promise<WaterRecord> {
    const record: WaterRecord = {
      id: generateId(),
      userId,
      amount,
      unit,
      timestamp: options?.timestamp || getTimestamp(),
      cupSize: options?.cupSize,
    };

    this.waterRecords.set(record.id, record);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`water:${userId}:${record.id}`, record);
    }

    return record;
  }

  async getWaterRecords(userId: string, startDate?: number, endDate?: number): Promise<WaterRecord[]> {
    const records: WaterRecord[] = [];
    const start = startDate || 0;
    const end = endDate || getTimestamp();

    for (const record of this.waterRecords.values()) {
      if (record.userId === userId && record.timestamp >= start && record.timestamp <= end) {
        records.push(record);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<WaterRecord>(`water:${userId}:`);
      const filtered = stored.filter(r => r.timestamp >= start && r.timestamp <= end);
      
      for (const r of filtered) {
        if (!records.find(rec => rec.id === r.id)) {
          records.push(r);
          this.waterRecords.set(r.id, r);
        }
      }
    }

    return records.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getWaterIntakeByDate(userId: string, date: number): Promise<{ amount: number; unit: UnitType; cups: number }> {
    const records = await this.getWaterRecords(userId, getStartOfDay(date), getEndOfDay(date));
    let totalMl = 0;
    let totalCups = 0;

    for (const record of records) {
      let amountMl = record.amount;
      if (record.unit === UnitType.LITER) {
        amountMl = record.amount * 1000;
      } else if (record.unit === UnitType.CUP) {
        amountMl = record.amount * 240;
      }
      totalMl += amountMl;

      if (record.cupSize) {
        totalCups += record.amount / record.cupSize;
      } else {
        totalCups += Math.ceil(amountMl / 240);
      }
    }

    return {
      amount: totalMl,
      unit: UnitType.MILLILITER,
      cups: Math.round(totalCups * 10) / 10,
    };
  }

  async recordWeight(
    userId: string,
    weight: number,
    unit: UnitType = UnitType.KILOGRAM,
    options?: {
      timestamp?: number;
      note?: string;
      bodyFat?: number;
      muscleMass?: number;
      waterWeight?: number;
      boneMass?: number;
    }
  ): Promise<WeightRecord> {
    const record: WeightRecord = {
      id: generateId(),
      userId,
      weight,
      unit,
      timestamp: options?.timestamp || getTimestamp(),
      note: options?.note,
      bodyFat: options?.bodyFat,
      muscleMass: options?.muscleMass,
      waterWeight: options?.waterWeight,
      boneMass: options?.boneMass,
    };

    this.weightRecords.set(record.id, record);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`weight:${userId}:${record.id}`, record);
    }

    return record;
  }

  async getWeightRecords(userId: string, startDate?: number, endDate?: number): Promise<WeightRecord[]> {
    const records: WeightRecord[] = [];
    const start = startDate || 0;
    const end = endDate || getTimestamp();

    for (const record of this.weightRecords.values()) {
      if (record.userId === userId && record.timestamp >= start && record.timestamp <= end) {
        records.push(record);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<WeightRecord>(`weight:${userId}:`);
      const filtered = stored.filter(r => r.timestamp >= start && r.timestamp <= end);
      
      for (const r of filtered) {
        if (!records.find(rec => rec.id === r.id)) {
          records.push(r);
          this.weightRecords.set(r.id, r);
        }
      }
    }

    return records.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getLatestWeight(userId: string): Promise<WeightRecord | null> {
    const records = await this.getWeightRecords(userId);
    return records.length > 0 ? records[0] : null;
  }

  async addFavoriteFood(userId: string, foodId: string): Promise<boolean> {
    this.favorites.add(`${userId}:${foodId}`);

    if (this.config.storageAdapter) {
      const favorites = await this.getFavoriteFoods(userId);
      if (!favorites.includes(foodId)) {
        favorites.push(foodId);
        await this.config.storageAdapter.set(`favorites:${userId}`, favorites);
      }
    }

    return true;
  }

  async removeFavoriteFood(userId: string, foodId: string): Promise<boolean> {
    this.favorites.delete(`${userId}:${foodId}`);

    if (this.config.storageAdapter) {
      const favorites = await this.getFavoriteFoods(userId);
      const filtered = favorites.filter(id => id !== foodId);
      await this.config.storageAdapter.set(`favorites:${userId}`, filtered);
    }

    return true;
  }

  async getFavoriteFoods(userId: string): Promise<string[]> {
    const cached = Array.from(this.favorites)
      .filter(key => key.startsWith(`${userId}:`))
      .map(key => key.split(':')[1]);

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.get<string[]>(`favorites:${userId}`);
      if (stored) {
        return [...new Set([...cached, ...stored])];
      }
    }

    return cached;
  }

  async isFavoriteFood(userId: string, foodId: string): Promise<boolean> {
    const favorites = await this.getFavoriteFoods(userId);
    return favorites.includes(foodId);
  }

  async createFoodCombination(
    userId: string,
    name: string,
    foods: { food: FoodItem; quantity: number; unit: UnitType }[],
    mealType: MealType
  ): Promise<FoodCombination> {
    const foodEntries: MealFoodEntry[] = foods.map(({ food, quantity, unit }) => {
      const nutrition = calculateNutritionForQuantity(
        food.nutritionFacts,
        food.servingSize,
        quantity
      );
      return {
        foodId: food.id,
        foodName: food.name,
        quantity,
        unit,
        nutritionFacts: nutrition,
      };
    });

    const totalNutrition = sumNutrition(foodEntries.map(f => f.nutritionFacts));

    const combination: FoodCombination = {
      id: generateId(),
      userId,
      name,
      foods: foodEntries,
      mealType,
      usageCount: 0,
      lastUsed: 0,
      totalNutrition,
    };

    this.foodCombinations.set(combination.id, combination);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`combination:${userId}:${combination.id}`, combination);
    }

    return combination;
  }

  async getFoodCombinations(userId: string): Promise<FoodCombination[]> {
    const combinations: FoodCombination[] = [];

    for (const combo of this.foodCombinations.values()) {
      if (combo.userId === userId) {
        combinations.push(combo);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<FoodCombination>(`combination:${userId}:`);
      
      for (const s of stored) {
        if (!combinations.find(c => c.id === s.id)) {
          combinations.push(s);
          this.foodCombinations.set(s.id, s);
        }
      }
    }

    return combinations.sort((a, b) => b.usageCount - a.usageCount);
  }

  async useFoodCombination(userId: string, combinationId: string): Promise<MealRecord | null> {
    const combo = this.foodCombinations.get(combinationId);
    if (!combo || combo.userId !== userId) return null;

    combo.usageCount++;
    combo.lastUsed = getTimestamp();

    this.foodCombinations.set(combinationId, combo);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`combination:${userId}:${combinationId}`, combo);
    }

    const meal: MealRecord = {
      id: generateId(),
      userId,
      mealType: combo.mealType,
      timestamp: getTimestamp(),
      foods: combo.foods,
      totalNutrition: combo.totalNutrition,
      notes: `From combination: ${combo.name}`,
    };

    this.meals.set(meal.id, meal);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`meal:${userId}:${meal.id}`, meal);
    }

    return meal;
  }

  async deleteFoodCombination(userId: string, combinationId: string): Promise<boolean> {
    this.foodCombinations.delete(combinationId);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.remove(`combination:${userId}:${combinationId}`);
    }

    return true;
  }

  async getDailyNutritionSummary(userId: string, date: number): Promise<NutritionFacts & { mealCount: number; waterMl: number }> {
    const meals = await this.getMealsByDate(userId, date);
    const water = await this.getWaterIntakeByDate(userId, date);

    const nutritionSum = meals.length > 0
      ? sumNutrition(meals.map(m => m.totalNutrition))
      : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    return {
      ...nutritionSum,
      mealCount: meals.length,
      waterMl: water.amount,
    };
  }

  async getMealFrequency(userId: string, startDate: number, endDate: number): Promise<Record<MealType, number>> {
    const meals = await this.getMealsByDateRange(userId, startDate, endDate);
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

  async getTopFoods(userId: string, startDate: number, endDate: number, limit: number = 10): Promise<{ name: string; count: number; foodId: string }[]> {
    const meals = await this.getMealsByDateRange(userId, startDate, endDate);
    const foodCountMap = new Map<string, { name: string; count: number }>();

    for (const meal of meals) {
      for (const food of meal.foods) {
        const existing = foodCountMap.get(food.foodId);
        if (existing) {
          existing.count++;
        } else {
          foodCountMap.set(food.foodId, { name: food.foodName, count: 1 });
        }
      }
    }

    return Array.from(foodCountMap.entries())
      .map(([foodId, data]) => ({ foodId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}
