import { UserProfileManager } from '../src/modules/UserProfile';
import { Gender, ActivityLevel, DietGoal, UnitType, AllergenType, DietPreference } from '../src/types';

describe('UserProfileManager', () => {
  let manager: UserProfileManager;

  beforeEach(() => {
    manager = new UserProfileManager();
  });

  const baseProfile = {
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
  };

  test('should create a user profile', async () => {
    const profile = await manager.createProfile(baseProfile);
    expect(profile).toBeDefined();
    expect(profile.userId).toBeDefined();
    expect(profile.nickname).toBe('测试用户');
    expect(profile.gender).toBe(Gender.MALE);
    expect(profile.createdAt).toBeDefined();
    expect(profile.updatedAt).toBeDefined();
  });

  test('should get a user profile', async () => {
    const created = await manager.createProfile(baseProfile);
    const profile = await manager.getProfile(created.userId);
    expect(profile).toBeDefined();
    expect(profile?.userId).toBe(created.userId);
  });

  test('should update a user profile', async () => {
    const created = await manager.createProfile(baseProfile);
    const updated = await manager.updateProfile(created.userId, {
      nickname: '更新后的昵称',
      weight: 68,
    });
    expect(updated).toBeDefined();
    expect(updated?.nickname).toBe('更新后的昵称');
    expect(updated?.weight).toBe(68);
  });

  test('should add and remove allergies', async () => {
    const created = await manager.createProfile(baseProfile);
    
    let updated = await manager.addAllergy(created.userId, AllergenType.PEANUT);
    expect(updated?.allergies).toContain(AllergenType.PEANUT);
    
    const hasAllergy = await manager.hasAllergy(created.userId, AllergenType.PEANUT);
    expect(hasAllergy).toBe(true);

    updated = await manager.removeAllergy(created.userId, AllergenType.PEANUT);
    expect(updated?.allergies).not.toContain(AllergenType.PEANUT);
  });

  test('should add and remove preferences', async () => {
    const created = await manager.createProfile(baseProfile);
    
    let updated = await manager.addPreference(created.userId, DietPreference.VEGETARIAN);
    expect(updated?.preferences).toContain(DietPreference.VEGETARIAN);

    const preferences = await manager.getPreferences(created.userId);
    expect(preferences).toContain(DietPreference.VEGETARIAN);

    updated = await manager.removePreference(created.userId, DietPreference.VEGETARIAN);
    expect(updated?.preferences).not.toContain(DietPreference.VEGETARIAN);
  });

  test('should calculate BMI correctly', async () => {
    const created = await manager.createProfile(baseProfile);
    const bmiResult = await manager.getBMI(created.userId);
    expect(bmiResult).toBeDefined();
    expect(bmiResult?.bmi).toBeCloseTo(22.86, 1);
    expect(bmiResult?.status).toBe('normal');
  });

  test('should get ideal weight range', async () => {
    const created = await manager.createProfile(baseProfile);
    const range = await manager.getIdealWeightRange(created.userId);
    expect(range).toBeDefined();
    expect(range?.min).toBeGreaterThan(0);
    expect(range!.max).toBeGreaterThan(range!.min);
    expect(range?.unit).toBe(UnitType.KILOGRAM);
  });

  test('should get desensitized profile', async () => {
    const created = await manager.createProfile(baseProfile);
    const desensitized = await manager.getDesensitizedProfile(created.userId, {
      maskWeight: true,
      maskHeight: true,
    });
    expect(desensitized).toBeDefined();
    expect(desensitized?.userId).not.toBe(created.userId);
  });

  test('should check if user can eat food based on allergies and preferences', async () => {
    const created = await manager.createProfile({
      ...baseProfile,
      allergies: [AllergenType.PEANUT],
      preferences: [DietPreference.VEGETARIAN],
    });

    const result1 = await manager.canEatFood(created.userId, [AllergenType.PEANUT]);
    expect(result1.canEat).toBe(false);
    expect(result1.reasons.length).toBeGreaterThan(0);

    const result2 = await manager.canEatFood(created.userId, [], ['meat']);
    expect(result2.canEat).toBe(false);
    expect(result2.reasons[0]).toContain('vegetarian');

    const result3 = await manager.canEatFood(created.userId, [], []);
    expect(result3.canEat).toBe(true);
  });

  test('should handle disliked foods', async () => {
    const created = await manager.createProfile(baseProfile);
    
    await manager.addDislikedFood(created.userId, 'food-123');
    const isDisliked = await manager.isDislikedFood(created.userId, 'food-123');
    expect(isDisliked).toBe(true);

    await manager.removeDislikedFood(created.userId, 'food-123');
    const isDislikedAfter = await manager.isDislikedFood(created.userId, 'food-123');
    expect(isDislikedAfter).toBe(false);
  });
});
