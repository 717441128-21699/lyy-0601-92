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
  ValidationResult,
  ValidationError,
  BatchOperationResult,
  DataQualityConfig,
} from '../types';
import {
  generateId,
  getTimestamp,
  calculateNutritionForQuantity,
  calculateFoodNutrition,
  sumNutrition,
  getStartOfDay,
  getEndOfDay,
  isSameDay,
  groupBy,
  convertUnit,
  normalizeWeightToGrams,
  normalizeVolumeToMl,
  normalizeWeightToKg,
  calculateCupsFromMl,
  isWeightUnit,
  isVolumeUnit,
  roundTo,
  validateMealFoodEntry,
  validateWaterRecord,
  validateWeightRecord,
  createBatchResult,
  DEFAULT_DATA_QUALITY_CONFIG,
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

  private getDataQualityConfig(): Partial<DataQualityConfig> {
    return {
      ...DEFAULT_DATA_QUALITY_CONFIG,
      ...this.config.dataQuality,
    };
  }

  async createMealRecord(
    userId: string,
    mealType: MealType,
    foods: { food: FoodItem; quantity: number; unit: UnitType; isCooked?: boolean }[],
    options?: { timestamp?: number; notes?: string; mood?: string; location?: string; validate?: boolean }
  ): Promise<MealRecord> {
    const now = getTimestamp();
    const dqConfig = this.getDataQualityConfig();
    const shouldValidate = options?.validate ?? dqConfig.enableValidation ?? true;
    
    const validationResults: ValidationResult[] = [];
    const processedFoods = foods.map(foodItem => {
      if (shouldValidate) {
        const validation = validateMealFoodEntry(
          foodItem.food,
          foodItem.quantity,
          foodItem.unit,
          dqConfig
        );
        validationResults.push(validation);
        
        if (!validation.isValid && dqConfig.rejectOnError) {
          const errorMessages = validation.errors.map(e => e.message).join('; ');
          throw new Error(`数据校验失败: ${errorMessages}`);
        }
        
        if (validation.correctedData && dqConfig.autoCorrectWarnings) {
          return { ...foodItem, ...validation.correctedData };
        }
      }
      return foodItem;
    });

    const foodEntries: MealFoodEntry[] = processedFoods.map(({ food, quantity, unit, isCooked }) => {
      let normalizedQuantity = quantity;
      let normalizedUnit = unit;
      
      const nutritionResult = calculateFoodNutrition(food, quantity, unit, { isCooked });
      const nutrition = nutritionResult.nutrition;
      
      if (isWeightUnit(unit) && isWeightUnit(food.servingUnit)) {
        normalizedQuantity = nutritionResult.normalizedQuantityGrams;
        normalizedUnit = UnitType.GRAM;
      } else if (isVolumeUnit(unit) && isVolumeUnit(food.servingUnit)) {
        normalizedQuantity = roundTo(normalizeVolumeToMl(quantity, unit), 2);
        normalizedUnit = UnitType.MILLILITER;
      } else if (unit !== food.servingUnit) {
        try {
          normalizedQuantity = roundTo(convertUnit(quantity, unit, food.servingUnit), 2);
          normalizedUnit = food.servingUnit;
        } catch {
          normalizedQuantity = nutritionResult.normalizedQuantityGrams;
          normalizedUnit = UnitType.GRAM;
        }
      } else {
        normalizedQuantity = quantity;
        normalizedUnit = unit;
      }
      
      return {
        foodId: food.id,
        foodName: food.name,
        quantity,
        unit,
        normalizedQuantity,
        normalizedUnit,
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
      foods?: { food: FoodItem; quantity: number; unit: UnitType; isCooked?: boolean }[];
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
      foodEntries = updates.foods.map(({ food, quantity, unit, isCooked }) => {
        let normalizedQuantity = quantity;
        let normalizedUnit = unit;
        
        const nutritionResult = calculateFoodNutrition(food, quantity, unit, { isCooked });
        const nutrition = nutritionResult.nutrition;
        
        if (isWeightUnit(unit) && isWeightUnit(food.servingUnit)) {
          normalizedQuantity = nutritionResult.normalizedQuantityGrams;
          normalizedUnit = UnitType.GRAM;
        } else if (isVolumeUnit(unit) && isVolumeUnit(food.servingUnit)) {
          normalizedQuantity = roundTo(normalizeVolumeToMl(quantity, unit), 2);
          normalizedUnit = UnitType.MILLILITER;
        } else if (unit !== food.servingUnit) {
          try {
            normalizedQuantity = roundTo(convertUnit(quantity, unit, food.servingUnit), 2);
            normalizedUnit = food.servingUnit;
          } catch {
            normalizedQuantity = nutritionResult.normalizedQuantityGrams;
            normalizedUnit = UnitType.GRAM;
          }
        }
        
        return {
          foodId: food.id,
          foodName: food.name,
          quantity,
          unit,
          normalizedQuantity,
          normalizedUnit,
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
    unit: UnitType,
    options?: { isCooked?: boolean }
  ): Promise<MealRecord | null> {
    const meal = await this.getMealRecord(userId, mealId);
    if (!meal) return null;

    let normalizedQuantity = quantity;
    let normalizedUnit = unit;
    
    const nutritionResult = calculateFoodNutrition(food, quantity, unit, options);
    const nutrition = nutritionResult.nutrition;
    
    if (isWeightUnit(unit) && isWeightUnit(food.servingUnit)) {
      normalizedQuantity = nutritionResult.normalizedQuantityGrams;
      normalizedUnit = UnitType.GRAM;
    } else if (isVolumeUnit(unit) && isVolumeUnit(food.servingUnit)) {
      normalizedQuantity = roundTo(normalizeVolumeToMl(quantity, unit), 2);
      normalizedUnit = UnitType.MILLILITER;
    } else if (unit !== food.servingUnit) {
      try {
        normalizedQuantity = roundTo(convertUnit(quantity, unit, food.servingUnit), 2);
        normalizedUnit = food.servingUnit;
      } catch {
        normalizedQuantity = nutritionResult.normalizedQuantityGrams;
        normalizedUnit = UnitType.GRAM;
      }
    }

    const foodEntry: MealFoodEntry = {
      foodId: food.id,
      foodName: food.name,
      quantity,
      unit,
      normalizedQuantity,
      normalizedUnit,
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
    options?: { timestamp?: number; cupSize?: number; validate?: boolean }
  ): Promise<WaterRecord> {
    const dqConfig = this.getDataQualityConfig();
    const shouldValidate = options?.validate ?? dqConfig.enableValidation ?? true;
    const timestamp = options?.timestamp || getTimestamp();
    
    let processedAmount = amount;
    let processedUnit = unit;
    let processedTimestamp = timestamp;
    
    if (shouldValidate) {
      const validation = validateWaterRecord(amount, unit, { timestamp, config: dqConfig });
      
      if (!validation.isValid && dqConfig.rejectOnError) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new Error(`数据校验失败: ${errorMessages}`);
      }
      
      if (validation.correctedData && dqConfig.autoCorrectWarnings) {
        processedAmount = validation.correctedData.amount;
        processedUnit = validation.correctedData.unit;
        processedTimestamp = validation.correctedData.timestamp;
      }
    }
    
    const normalizedAmountMl = roundTo(normalizeVolumeToMl(processedAmount, processedUnit), 2);
    const cupSize = options?.cupSize || 240;
    const cups = calculateCupsFromMl(normalizedAmountMl, cupSize);
    
    const record: WaterRecord = {
      id: generateId(),
      userId,
      amount: processedAmount,
      unit: processedUnit,
      normalizedAmountMl,
      timestamp: processedTimestamp,
      cupSize,
      cups,
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

  async getWaterIntakeByDate(userId: string, date: number): Promise<{ amount: number; unit: UnitType; cups: number; totalMl: number; totalCups: number }> {
    const records = await this.getWaterRecords(userId, getStartOfDay(date), getEndOfDay(date));
    let totalMl = 0;
    let totalCups = 0;

    for (const record of records) {
      totalMl += record.normalizedAmountMl;
      totalCups += record.cups || 0;
    }

    return {
      amount: roundTo(totalMl, 2),
      unit: UnitType.MILLILITER,
      cups: roundTo(totalCups, 1),
      totalMl,
      totalCups: roundTo(totalCups, 1),
    };
  }

  async getWaterIntakeByDateRange(userId: string, startDate: number, endDate: number): Promise<Array<{ date: number; totalMl: number; totalCups: number }>> {
    const records = await this.getWaterRecords(userId, startDate, endDate);
    const dailyData: Map<number, { totalMl: number; totalCups: number }> = new Map();

    for (const record of records) {
      const dayStart = getStartOfDay(record.timestamp);
      const existing = dailyData.get(dayStart) || { totalMl: 0, totalCups: 0 };
      existing.totalMl += record.normalizedAmountMl;
      existing.totalCups += record.cups || 0;
      dailyData.set(dayStart, existing);
    }

    const result: Array<{ date: number; totalMl: number; totalCups: number }> = [];
    for (const [date, data] of dailyData) {
      result.push({
        date,
        totalMl: roundTo(data.totalMl, 2),
        totalCups: roundTo(data.totalCups, 1),
      });
    }

    return result.sort((a, b) => a.date - b.date);
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
      validate?: boolean;
    }
  ): Promise<WeightRecord> {
    const dqConfig = this.getDataQualityConfig();
    const shouldValidate = options?.validate ?? dqConfig.enableValidation ?? true;
    const timestamp = options?.timestamp || getTimestamp();
    
    let processedWeight = weight;
    let processedUnit = unit;
    let processedTimestamp = timestamp;
    
    if (shouldValidate) {
      const validation = validateWeightRecord(weight, unit, { timestamp, config: dqConfig });
      
      if (!validation.isValid && dqConfig.rejectOnError) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new Error(`数据校验失败: ${errorMessages}`);
      }
      
      if (validation.correctedData && dqConfig.autoCorrectWarnings) {
        processedWeight = validation.correctedData.weight;
        processedUnit = validation.correctedData.unit;
        processedTimestamp = validation.correctedData.timestamp;
      }
    }
    
    const normalizedWeightKg = roundTo(normalizeWeightToKg(processedWeight, processedUnit), 2);
    
    const record: WeightRecord = {
      id: generateId(),
      userId,
      weight: processedWeight,
      unit: processedUnit,
      normalizedWeightKg,
      timestamp: processedTimestamp,
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
      const stored = await this.config.storageAdapter.get<string[]>(`favorites:${userId}`);
      const favorites = stored || [];
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
    foods: { food: FoodItem; quantity: number; unit: UnitType; isCooked?: boolean }[],
    mealType: MealType
  ): Promise<FoodCombination> {
    const foodEntries: MealFoodEntry[] = foods.map(({ food, quantity, unit, isCooked }) => {
      let normalizedQuantity = quantity;
      let normalizedUnit = unit;
      
      const nutritionResult = calculateFoodNutrition(food, quantity, unit, { isCooked });
      const nutrition = nutritionResult.nutrition;
      
      if (isWeightUnit(unit) && isWeightUnit(food.servingUnit)) {
        normalizedQuantity = nutritionResult.normalizedQuantityGrams;
        normalizedUnit = UnitType.GRAM;
      } else if (isVolumeUnit(unit) && isVolumeUnit(food.servingUnit)) {
        normalizedQuantity = roundTo(normalizeVolumeToMl(quantity, unit), 2);
        normalizedUnit = UnitType.MILLILITER;
      } else if (unit !== food.servingUnit) {
        try {
          normalizedQuantity = roundTo(convertUnit(quantity, unit, food.servingUnit), 2);
          normalizedUnit = food.servingUnit;
        } catch {
          normalizedQuantity = nutritionResult.normalizedQuantityGrams;
          normalizedUnit = UnitType.GRAM;
        }
      }
      
      return {
        foodId: food.id,
        foodName: food.name,
        quantity,
        unit,
        normalizedQuantity,
        normalizedUnit,
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
    let combo = this.foodCombinations.get(combinationId);
    
    if (!combo && this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.get<FoodCombination>(`combination:${userId}:${combinationId}`);
      if (stored) {
        combo = stored;
        this.foodCombinations.set(combinationId, combo);
      }
    }
    
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

  async batchCreateMealRecords(
    userId: string,
    mealData: Array<{
      mealType: MealType;
      foods: { food: FoodItem; quantity: number; unit: UnitType; isCooked?: boolean }[];
      options?: { timestamp?: number; notes?: string; mood?: string; location?: string };
    }>
  ): Promise<BatchOperationResult<MealRecord>> {
    const dqConfig = this.getDataQualityConfig();
    
    const result = await createBatchResult(mealData, async (item, index) => {
      const allErrors: ValidationError[] = [];
      const allWarnings: ValidationError[] = [];
      
      for (const foodItem of item.foods) {
        const validation = validateMealFoodEntry(
          foodItem.food,
          foodItem.quantity,
          foodItem.unit,
          dqConfig
        );
        allErrors.push(...validation.errors);
        allWarnings.push(...validation.warnings);
      }
      
      if (allErrors.length > 0) {
        return {
          valid: false,
          errors: allErrors,
          warnings: allWarnings,
        };
      }
      
      try {
        const meal = await this.createMealRecord(userId, item.mealType, item.foods, {
          ...item.options,
          validate: false,
        });
        return { valid: true, errors: [], warnings: allWarnings, data: meal, id: meal.id };
      } catch (error: any) {
        return {
          valid: false,
          errors: [{
            code: 'INVALID_QUANTITY',
            severity: 'error',
            field: 'meal',
            message: error.message,
            suggestion: '请检查数据后重试',
            currentValue: item,
          }],
          warnings: [],
        };
      }
    });

    return result;
  }

  async batchRecordWater(
    userId: string,
    waterData: Array<{ amount: number; unit?: UnitType; timestamp?: number }>
  ): Promise<BatchOperationResult<WaterRecord>> {
    const dqConfig = this.getDataQualityConfig();
    
    const result = await createBatchResult(waterData, async (item, index) => {
      const unit = item.unit || UnitType.MILLILITER;
      const validation = validateWaterRecord(item.amount, unit, { timestamp: item.timestamp, config: dqConfig });
      
      if (!validation.isValid) {
        return {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      
      try {
        const record = await this.recordWater(userId, item.amount, unit, {
          timestamp: item.timestamp,
          validate: false,
        });
        return { valid: true, errors: [], warnings: validation.warnings, data: record, id: record.id };
      } catch (error: any) {
        return {
          valid: false,
          errors: [{
            code: 'INVALID_QUANTITY',
            severity: 'error',
            field: 'water',
            message: error.message,
            suggestion: '请检查数据后重试',
            currentValue: item,
          }],
          warnings: [],
        };
      }
    });

    return result;
  }

  async batchRecordWeight(
    userId: string,
    weightData: Array<{ weight: number; unit?: UnitType; timestamp?: number; note?: string }>
  ): Promise<BatchOperationResult<WeightRecord>> {
    const dqConfig = this.getDataQualityConfig();
    
    const result = await createBatchResult(weightData, async (item, index) => {
      const unit = item.unit || UnitType.KILOGRAM;
      const validation = validateWeightRecord(item.weight, unit, { timestamp: item.timestamp, config: dqConfig });
      
      if (!validation.isValid) {
        return {
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }
      
      try {
        const record = await this.recordWeight(userId, item.weight, unit, {
          timestamp: item.timestamp,
          note: item.note,
          validate: false,
        });
        return { valid: true, errors: [], warnings: validation.warnings, data: record, id: record.id };
      } catch (error: any) {
        return {
          valid: false,
          errors: [{
            code: 'INVALID_QUANTITY',
            severity: 'error',
            field: 'weight',
            message: error.message,
            suggestion: '请检查数据后重试',
            currentValue: item,
          }],
          warnings: [],
        };
      }
    });

    return result;
  }
}
