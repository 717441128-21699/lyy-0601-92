import {
  FoodItem,
  UnitType,
  UnitConversionRate,
  NutritionFacts,
  SDKConfig,
} from '../types';
import {
  generateId,
  convertUnit,
  calculateNutritionForQuantity,
  roundTo,
} from '../utils/helpers';

interface PortionEstimate {
  quantity: number;
  unit: UnitType;
  confidence: number;
  method: string;
}

interface FoodMatch {
  food: FoodItem;
  similarity: number;
  isExactMatch: boolean;
}

export class FoodEstimationManager {
  private config: SDKConfig;
  private foodDatabase: Map<string, FoodItem> = new Map();
  private customConversionRates: UnitConversionRate[] = [];

  private standardPortions: Record<string, { quantity: number; unit: UnitType; description: string }[]> = {
    apple: [
      { quantity: 1, unit: UnitType.PIECE, description: '小苹果' },
      { quantity: 150, unit: UnitType.GRAM, description: '中等苹果' },
      { quantity: 200, unit: UnitType.GRAM, description: '大苹果' },
    ],
    rice: [
      { quantity: 100, unit: UnitType.GRAM, description: '一小碗' },
      { quantity: 150, unit: UnitType.GRAM, description: '一中碗' },
      { quantity: 200, unit: UnitType.GRAM, description: '一大碗' },
    ],
    egg: [
      { quantity: 1, unit: UnitType.PIECE, description: '一个鸡蛋' },
      { quantity: 50, unit: UnitType.GRAM, description: '约50克' },
    ],
    bread: [
      { quantity: 1, unit: UnitType.PIECE, description: '一片面包' },
      { quantity: 30, unit: UnitType.GRAM, description: '约30克' },
    ],
    milk: [
      { quantity: 250, unit: UnitType.MILLILITER, description: '一盒' },
      { quantity: 1, unit: UnitType.CUP, description: '一杯' },
    ],
    chicken: [
      { quantity: 100, unit: UnitType.GRAM, description: '手掌大小' },
      { quantity: 150, unit: UnitType.GRAM, description: '鸡胸肉一块' },
    ],
    fish: [
      { quantity: 100, unit: UnitType.GRAM, description: '手掌大小' },
      { quantity: 150, unit: UnitType.GRAM, description: '一块鱼肉' },
    ],
    vegetable: [
      { quantity: 100, unit: UnitType.GRAM, description: '一小碟' },
      { quantity: 200, unit: UnitType.GRAM, description: '一盘蔬菜' },
    ],
  };

  private visualReference: Record<string, { reference: string; quantity: number; unit: UnitType }> = {
    fist: { reference: '拳头大小', quantity: 200, unit: UnitType.GRAM },
    palm: { reference: '手掌大小', quantity: 100, unit: UnitType.GRAM },
    thumb: { reference: '拇指大小', quantity: 30, unit: UnitType.GRAM },
    cuppedHand: { reference: '双手捧起', quantity: 150, unit: UnitType.GRAM },
  };

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async addFoodItem(food: Omit<FoodItem, 'id'> & { id?: string }): Promise<FoodItem> {
    const item: FoodItem = {
      ...food,
      id: food.id || generateId(),
    };

    this.foodDatabase.set(item.id, item);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`food:${item.id}`, item);
    }

    return item;
  }

  async getFoodItem(foodId: string): Promise<FoodItem | null> {
    const cached = this.foodDatabase.get(foodId);
    if (cached) return cached;

    if (this.config.storageAdapter) {
      const food = await this.config.storageAdapter.get<FoodItem>(`food:${foodId}`);
      if (food) {
        this.foodDatabase.set(foodId, food);
        return food;
      }
    }

    return null;
  }

  async searchFood(keyword: string, limit: number = 20): Promise<FoodMatch[]> {
    const matches: FoodMatch[] = [];
    const lowerKeyword = keyword.toLowerCase();

    for (const food of this.foodDatabase.values()) {
      const nameLower = food.name.toLowerCase();
      let similarity = 0;

      if (nameLower === lowerKeyword) {
        similarity = 1;
      } else if (nameLower.startsWith(lowerKeyword)) {
        similarity = 0.9;
      } else if (nameLower.includes(lowerKeyword)) {
        similarity = 0.7;
      } else {
        const keywordChars = lowerKeyword.split('');
        const matchCount = keywordChars.filter(c => nameLower.includes(c)).length;
        similarity = matchCount / keywordChars.length * 0.5;
      }

      if (similarity > 0.3) {
        matches.push({
          food,
          similarity: roundTo(similarity, 2),
          isExactMatch: nameLower === lowerKeyword,
        });
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<FoodItem>('food:');
      for (const food of stored) {
        if (!this.foodDatabase.has(food.id)) {
          this.foodDatabase.set(food.id, food);
          const nameLower = food.name.toLowerCase();
          let similarity = 0;

          if (nameLower === lowerKeyword) {
            similarity = 1;
          } else if (nameLower.startsWith(lowerKeyword)) {
            similarity = 0.9;
          } else if (nameLower.includes(lowerKeyword)) {
            similarity = 0.7;
          }

          if (similarity > 0.3 && !matches.find(m => m.food.id === food.id)) {
            matches.push({
              food,
              similarity: roundTo(similarity, 2),
              isExactMatch: nameLower === lowerKeyword,
            });
          }
        }
      }
    }

    return matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async estimatePortion(
    foodName: string,
    description?: string,
    visualHint?: 'fist' | 'palm' | 'thumb' | 'cuppedHand'
  ): Promise<PortionEstimate> {
    const lowerName = foodName.toLowerCase();

    if (visualHint && this.visualReference[visualHint]) {
      const ref = this.visualReference[visualHint];
      return {
        quantity: ref.quantity,
        unit: ref.unit,
        confidence: 0.8,
        method: `视觉参考: ${ref.reference}`,
      };
    }

    for (const [key, portions] of Object.entries(this.standardPortions)) {
      if (lowerName.includes(key) && portions.length > 0) {
        const defaultPortion = portions[1] || portions[0];
        return {
          quantity: defaultPortion.quantity,
          unit: defaultPortion.unit,
          confidence: 0.75,
          method: `标准份量: ${defaultPortion.description}`,
        };
      }
    }

    if (description) {
      if (description.includes('小') || description.includes('少量')) {
        return { quantity: 50, unit: UnitType.GRAM, confidence: 0.6, method: '描述: 小份' };
      }
      if (description.includes('大') || description.includes('多')) {
        return { quantity: 200, unit: UnitType.GRAM, confidence: 0.6, method: '描述: 大份' };
      }
      if (description.includes('中') || description.includes('正常')) {
        return { quantity: 100, unit: UnitType.GRAM, confidence: 0.6, method: '描述: 中份' };
      }
    }

    return {
      quantity: 100,
      unit: UnitType.GRAM,
      confidence: 0.5,
      method: '默认估算',
    };
  }

  async calculateNutrition(
    food: FoodItem,
    quantity: number,
    unit: UnitType
  ): Promise<NutritionFacts> {
    let targetQuantity = quantity;

    if (unit !== food.servingUnit) {
      try {
        targetQuantity = convertUnit(quantity, unit, food.servingUnit, this.customConversionRates);
      } catch {
        console.warn(`Cannot convert ${unit} to ${food.servingUnit}, using original quantity`);
      }
    }

    return calculateNutritionForQuantity(food.nutritionFacts, food.servingSize, targetQuantity);
  }

  async quickEstimate(
    foodName: string,
    quantity?: number,
    unit?: UnitType,
    description?: string
  ): Promise<{
    food: FoodItem | null;
    estimatedQuantity: number;
    estimatedUnit: UnitType;
    estimatedNutrition: NutritionFacts;
    confidence: number;
  }> {
    const matches = await this.searchFood(foodName, 1);
    const food = matches.length > 0 ? matches[0].food : null;
    const baseConfidence = matches.length > 0 ? matches[0].similarity : 0.3;

    let estimatedQuantity: number;
    let estimatedUnit: UnitType;
    let portionConfidence = 0.5;

    if (quantity && unit) {
      estimatedQuantity = quantity;
      estimatedUnit = unit;
      portionConfidence = 1;
    } else {
      const portion = await this.estimatePortion(foodName, description);
      estimatedQuantity = portion.quantity;
      estimatedUnit = portion.unit;
      portionConfidence = portion.confidence;
    }

    const estimatedNutrition = food
      ? await this.calculateNutrition(food, estimatedQuantity, estimatedUnit)
      : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    return {
      food,
      estimatedQuantity,
      estimatedUnit,
      estimatedNutrition,
      confidence: roundTo(baseConfidence * portionConfidence, 2),
    };
  }

  async batchCalculateNutrition(
    items: { food: FoodItem; quantity: number; unit: UnitType }[]
  ): Promise<{
    items: { food: FoodItem; nutrition: NutritionFacts }[];
    total: NutritionFacts;
  }> {
    const calculated = await Promise.all(
      items.map(async item => ({
        food: item.food,
        nutrition: await this.calculateNutrition(item.food, item.quantity, item.unit),
      }))
    );

    const total = calculated.reduce<NutritionFacts>(
      (acc, curr) => ({
        calories: acc.calories + curr.nutrition.calories,
        protein: acc.protein + curr.nutrition.protein,
        carbs: acc.carbs + curr.nutrition.carbs,
        fat: acc.fat + curr.nutrition.fat,
        fiber: (acc.fiber || 0) + (curr.nutrition.fiber || 0) || undefined,
        sugar: (acc.sugar || 0) + (curr.nutrition.sugar || 0) || undefined,
        sodium: (acc.sodium || 0) + (curr.nutrition.sodium || 0) || undefined,
      }),
      { 
        calories: 0, 
        protein: 0, 
        carbs: 0, 
        fat: 0,
        fiber: undefined,
        sugar: undefined,
        sodium: undefined
      }
    );

    return { items: calculated, total };
  }

  addCustomConversionRate(rate: UnitConversionRate): void {
    this.customConversionRates.push(rate);
  }

  getStandardPortions(foodCategory?: string): Record<string, { quantity: number; unit: UnitType; description: string }[]> {
    if (foodCategory) {
      return Object.fromEntries(
        Object.entries(this.standardPortions).filter(([key]) => key.includes(foodCategory.toLowerCase()))
      );
    }
    return this.standardPortions;
  }

  getVisualReferences(): Record<string, { reference: string; quantity: number; unit: UnitType }> {
    return this.visualReference;
  }

  async compareFoods(foodIds: string[], nutrients: (keyof NutritionFacts)[] = ['calories', 'protein', 'carbs', 'fat']): Promise<{
    comparison: Record<string, Record<keyof NutritionFacts, number>>;
    recommendations: string[];
  }> {
    const foods = await Promise.all(foodIds.map(id => this.getFoodItem(id)));
    const validFoods = foods.filter((f): f is FoodItem => f !== null);

    const comparison: Record<string, Record<keyof NutritionFacts, number>> = {};
    const recommendations: string[] = [];

    for (const food of validFoods) {
      comparison[food.id] = {} as Record<keyof NutritionFacts, number>;
      for (const nutrient of nutrients) {
        comparison[food.id][nutrient] = food.nutritionFacts[nutrient] || 0;
      }
    }

    if (validFoods.length >= 2) {
      const lowestCalorie = validFoods.reduce((min, f) =>
        f.nutritionFacts.calories < min.nutritionFacts.calories ? f : min
      );
      recommendations.push(`${lowestCalorie.name} 的热量最低，更适合控制体重`);

      const highestProtein = validFoods.reduce((max, f) =>
        (f.nutritionFacts.protein || 0) > (max.nutritionFacts.protein || 0) ? f : max
      );
      recommendations.push(`${highestProtein.name} 的蛋白质含量最高，适合增肌`);
    }

    return { comparison, recommendations };
  }

  async getCalorieDensity(food: FoodItem): Promise<{ density: number; level: 'low' | 'medium' | 'high' }> {
    const nutrition = await this.calculateNutrition(food, 100, UnitType.GRAM);
    const density = nutrition.calories;

    let level: 'low' | 'medium' | 'high' = 'medium';
    if (density < 100) level = 'low';
    else if (density > 300) level = 'high';

    return { density: roundTo(density, 1), level };
  }
}
