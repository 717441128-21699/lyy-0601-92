import {
  UserProfile,
  AllergenType,
  DietPreference,
  Gender,
  ActivityLevel,
  DietGoal,
  UnitType,
  DesensitizeOptions,
  SDKConfig,
} from '../types';
import { generateId, getTimestamp, desensitizeUserProfile, calculateBMI, getBMIStatus } from '../utils/helpers';

export class UserProfileManager {
  private config: SDKConfig;
  private profiles: Map<string, UserProfile> = new Map();

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async createProfile(data: Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'> & { userId?: string }): Promise<UserProfile> {
    const now = getTimestamp();
    const profile: UserProfile = {
      userId: data.userId || generateId(),
      nickname: data.nickname,
      avatar: data.avatar,
      gender: data.gender,
      birthDate: data.birthDate,
      height: data.height,
      heightUnit: data.heightUnit || UnitType.CENTIMETER,
      weight: data.weight,
      weightUnit: data.weightUnit || UnitType.KILOGRAM,
      activityLevel: data.activityLevel,
      dietGoal: data.dietGoal,
      targetWeight: data.targetWeight,
      allergies: data.allergies || [],
      preferences: data.preferences || [],
      dislikedFoods: data.dislikedFoods || [],
      medicalConditions: data.medicalConditions || [],
      medications: data.medications || [],
      timezone: data.timezone || this.config.timezone || 'Asia/Shanghai',
      createdAt: now,
      updatedAt: now,
    };

    this.profiles.set(profile.userId, profile);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`profile:${profile.userId}`, profile);
    }

    return profile;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const cached = this.profiles.get(userId);
    if (cached) return cached;

    if (this.config.storageAdapter) {
      const profile = await this.config.storageAdapter.get<UserProfile>(`profile:${userId}`);
      if (profile) {
        this.profiles.set(userId, profile);
        return profile;
      }
    }

    return null;
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const updated: UserProfile = {
      ...profile,
      ...updates,
      userId,
      updatedAt: getTimestamp(),
    };

    this.profiles.set(userId, updated);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`profile:${userId}`, updated);
    }

    return updated;
  }

  async deleteProfile(userId: string): Promise<boolean> {
    this.profiles.delete(userId);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.remove(`profile:${userId}`);
    }

    return true;
  }

  async addAllergy(userId: string, allergen: AllergenType): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const allergies = [...new Set([...(profile.allergies || []), allergen])];
    return this.updateProfile(userId, { allergies });
  }

  async removeAllergy(userId: string, allergen: AllergenType): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const allergies = (profile.allergies || []).filter(a => a !== allergen);
    return this.updateProfile(userId, { allergies });
  }

  async hasAllergy(userId: string, allergen: AllergenType): Promise<boolean> {
    const profile = await this.getProfile(userId);
    return profile ? (profile.allergies || []).includes(allergen) : false;
  }

  async getAllergies(userId: string): Promise<AllergenType[]> {
    const profile = await this.getProfile(userId);
    return profile?.allergies || [];
  }

  async addPreference(userId: string, preference: DietPreference): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const preferences = [...new Set([...(profile.preferences || []), preference])];
    return this.updateProfile(userId, { preferences });
  }

  async removePreference(userId: string, preference: DietPreference): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const preferences = (profile.preferences || []).filter(p => p !== preference);
    return this.updateProfile(userId, { preferences });
  }

  async getPreferences(userId: string): Promise<DietPreference[]> {
    const profile = await this.getProfile(userId);
    return profile?.preferences || [];
  }

  async addDislikedFood(userId: string, foodId: string): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const dislikedFoods = [...new Set([...(profile.dislikedFoods || []), foodId])];
    return this.updateProfile(userId, { dislikedFoods });
  }

  async removeDislikedFood(userId: string, foodId: string): Promise<UserProfile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const dislikedFoods = (profile.dislikedFoods || []).filter(id => id !== foodId);
    return this.updateProfile(userId, { dislikedFoods });
  }

  async isDislikedFood(userId: string, foodId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    return profile ? (profile.dislikedFoods || []).includes(foodId) : false;
  }

  async updateBasicInfo(
    userId: string,
    data: {
      nickname?: string;
      avatar?: string;
      gender?: Gender;
      birthDate?: number;
      height?: number;
      heightUnit?: UnitType;
      weight?: number;
      weightUnit?: UnitType;
      activityLevel?: ActivityLevel;
      dietGoal?: DietGoal;
      targetWeight?: number;
    }
  ): Promise<UserProfile | null> {
    return this.updateProfile(userId, data);
  }

  async getAge(userId: string): Promise<number | null> {
    const profile = await this.getProfile(userId);
    if (!profile || !profile.birthDate) return null;

    const now = new Date();
    const birth = new Date(profile.birthDate);
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  async getBMI(userId: string): Promise<{ bmi: number; status: string } | null> {
    const profile = await this.getProfile(userId);
    if (!profile || !profile.weight || !profile.height) return null;

    const bmi = calculateBMI(
      profile.weight,
      profile.height,
      profile.weightUnit,
      profile.heightUnit
    );

    return {
      bmi,
      status: getBMIStatus(bmi),
    };
  }

  async getDesensitizedProfile(userId: string, options?: DesensitizeOptions): Promise<Partial<UserProfile> | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;

    const desensitizeOptions = { ...this.config.desensitize, ...options };
    return desensitizeUserProfile(profile, desensitizeOptions);
  }

  async getIdealWeightRange(userId: string): Promise<{ min: number; max: number; unit: UnitType } | null> {
    const profile = await this.getProfile(userId);
    if (!profile || !profile.height || !profile.heightUnit) return null;

    let heightM = profile.height;
    if (profile.heightUnit === UnitType.CENTIMETER) {
      heightM = profile.height / 100;
    } else if (profile.heightUnit === UnitType.INCH) {
      heightM = (profile.height * 2.54) / 100;
    }

    const minBMI = 18.5;
    const maxBMI = 23.9;

    const unit = profile.weightUnit || UnitType.KILOGRAM;
    let minWeight = minBMI * heightM * heightM;
    let maxWeight = maxBMI * heightM * heightM;

    if (unit === UnitType.POUND) {
      minWeight = minWeight * 2.20462;
      maxWeight = maxWeight * 2.20462;
    }

    return {
      min: Math.round(minWeight * 10) / 10,
      max: Math.round(maxWeight * 10) / 10,
      unit,
    };
  }

  async updateMedicalInfo(
    userId: string,
    data: {
      medicalConditions?: string[];
      medications?: string[];
    }
  ): Promise<UserProfile | null> {
    return this.updateProfile(userId, data);
  }

  async canEatFood(userId: string, foodAllergens?: AllergenType[], foodTags?: string[]): Promise<{ canEat: boolean; reasons: string[] }> {
    const profile = await this.getProfile(userId);
    if (!profile) return { canEat: true, reasons: [] };

    const reasons: string[] = [];

    const userAllergies = profile.allergies || [];
    const foodAllergenList = foodAllergens || [];
    const allergenOverlap = userAllergies.filter(a => foodAllergenList.includes(a));

    if (allergenOverlap.length > 0) {
      reasons.push(`Contains allergens: ${allergenOverlap.join(', ')}`);
    }

    const userPrefs = profile.preferences || [];
    const foodTagList = foodTags || [];

    if (userPrefs.includes(DietPreference.VEGETARIAN) && foodTagList.includes('meat')) {
      reasons.push('Contains meat, conflicting with vegetarian preference');
    }

    if (userPrefs.includes(DietPreference.VEGAN) && (foodTagList.includes('meat') || foodTagList.includes('dairy') || foodTagList.includes('egg'))) {
      reasons.push('Contains animal products, conflicting with vegan preference');
    }

    if (userPrefs.includes(DietPreference.GLUTEN_FREE) && foodTagList.includes('gluten')) {
      reasons.push('Contains gluten, conflicting with gluten-free preference');
    }

    if (userPrefs.includes(DietPreference.DAIRY_FREE) && foodTagList.includes('dairy')) {
      reasons.push('Contains dairy, conflicting with dairy-free preference');
    }

    return {
      canEat: reasons.length === 0,
      reasons,
    };
  }
}
