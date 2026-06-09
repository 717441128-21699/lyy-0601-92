import {
  ReminderRule,
  AlertRule,
  MealRecord,
  UserGoals,
  SDKConfig,
  MealType,
  WeightRecord,
  NutritionFacts,
} from '../types';
import {
  generateId,
  getTimestamp,
  getStartOfDay,
  getEndOfDay,
  isSameDay,
  roundTo,
} from '../utils/helpers';

interface ReminderCheckResult {
  dueReminders: Array<{ reminder: ReminderRule; dueAt: number; minutesUntilDue: number }>;
  preMealReminders: Array<{ reminder: ReminderRule; mealType: MealType; minutesUntilMeal: number }>;
}

interface AlertCheckResult {
  triggeredAlerts: Array<{
    alert: AlertRule;
    currentValue: number;
    threshold: number;
    message: string;
  }>;
}

export class ReminderRulesManager {
  private config: SDKConfig;
  private reminders: Map<string, ReminderRule> = new Map();
  private alerts: Map<string, AlertRule> = new Map();

  constructor(config: SDKConfig = {}) {
    this.config = config;
  }

  async createReminder(data: Omit<ReminderRule, 'id'> & { id?: string }): Promise<ReminderRule> {
    const reminder: ReminderRule = {
      ...data,
      id: data.id || generateId(),
    };

    this.reminders.set(reminder.id, reminder);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`reminder:${reminder.userId}:${reminder.id}`, reminder);
    }

    return reminder;
  }

  async getReminder(userId: string, reminderId: string): Promise<ReminderRule | null> {
    const cached = this.reminders.get(reminderId);
    if (cached && cached.userId === userId) return cached;

    if (this.config.storageAdapter) {
      const reminder = await this.config.storageAdapter.get<ReminderRule>(`reminder:${userId}:${reminderId}`);
      if (reminder) {
        this.reminders.set(reminderId, reminder);
        return reminder;
      }
    }

    return null;
  }

  async getReminders(userId: string, type?: ReminderRule['type']): Promise<ReminderRule[]> {
    const reminders: ReminderRule[] = [];

    for (const reminder of this.reminders.values()) {
      if (reminder.userId === userId && (!type || reminder.type === type)) {
        reminders.push(reminder);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<ReminderRule>(`reminder:${userId}:`);
      const filtered = stored.filter(r => !type || r.type === type);
      
      for (const r of filtered) {
        if (!reminders.find(rem => rem.id === r.id)) {
          reminders.push(r);
          this.reminders.set(r.id, r);
        }
      }
    }

    return reminders.sort((a, b) => a.time.localeCompare(b.time));
  }

  async updateReminder(userId: string, reminderId: string, updates: Partial<ReminderRule>): Promise<ReminderRule | null> {
    const reminder = await this.getReminder(userId, reminderId);
    if (!reminder) return null;

    const updated: ReminderRule = {
      ...reminder,
      ...updates,
    };

    this.reminders.set(reminderId, updated);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`reminder:${userId}:${reminderId}`, updated);
    }

    return updated;
  }

  async deleteReminder(userId: string, reminderId: string): Promise<boolean> {
    this.reminders.delete(reminderId);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.remove(`reminder:${userId}:${reminderId}`);
    }

    return true;
  }

  async createPreMealReminder(
    userId: string,
    mealType: MealType,
    time: string,
    preMealMinutes: number = 15
  ): Promise<ReminderRule> {
    const labels: Record<MealType, string> = {
      [MealType.BREAKFAST]: '早餐提醒',
      [MealType.LUNCH]: '午餐提醒',
      [MealType.DINNER]: '晚餐提醒',
      [MealType.SNACK]: '加餐提醒',
    };

    return this.createReminder({
      userId,
      type: 'meal',
      enabled: true,
      time,
      label: labels[mealType],
      repeatDays: [0, 1, 2, 3, 4, 5, 6],
      snoozeEnabled: true,
      preMealReminder: true,
      preMealMinutes,
    });
  }

  async createWaterReminder(
    userId: string,
    startTime: string = '09:00',
    endTime: string = '21:00',
    intervalHours: number = 2
  ): Promise<ReminderRule[]> {
    const reminders: ReminderRule[] = [];
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const intervalMinutes = intervalHours * 60;

    for (let minutes = startMinutes; minutes <= endMinutes; minutes += intervalMinutes) {
      const h = Math.floor(minutes / 60).toString().padStart(2, '0');
      const m = (minutes % 60).toString().padStart(2, '0');
      const time = `${h}:${m}`;

      const reminder = await this.createReminder({
        userId,
        type: 'water',
        enabled: true,
        time,
        label: '喝水提醒',
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        snoozeEnabled: true,
      });

      reminders.push(reminder);
    }

    return reminders;
  }

  async createWeightReminder(
    userId: string,
    time: string = '08:00',
    repeatDays: number[] = [0, 1, 2, 3, 4, 5, 6]
  ): Promise<ReminderRule> {
    return this.createReminder({
      userId,
      type: 'weight',
      enabled: true,
      time,
      label: '称重提醒',
      repeatDays,
      snoozeEnabled: false,
    });
  }

  async createAlertRule(data: Omit<AlertRule, 'id'> & { id?: string }): Promise<AlertRule> {
    const alert: AlertRule = {
      ...data,
      id: data.id || generateId(),
    };

    this.alerts.set(alert.id, alert);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`alert:${alert.userId}:${alert.id}`, alert);
    }

    return alert;
  }

  async getAlertRules(userId: string, type?: AlertRule['type']): Promise<AlertRule[]> {
    const alerts: AlertRule[] = [];

    for (const alert of this.alerts.values()) {
      if (alert.userId === userId && (!type || alert.type === type)) {
        alerts.push(alert);
      }
    }

    if (this.config.storageAdapter) {
      const stored = await this.config.storageAdapter.list<AlertRule>(`alert:${userId}:`);
      const filtered = stored.filter(a => !type || a.type === type);
      
      for (const a of filtered) {
        if (!alerts.find(al => al.id === a.id)) {
          alerts.push(a);
          this.alerts.set(a.id, a);
        }
      }
    }

    return alerts;
  }

  async updateAlertRule(userId: string, alertId: string, updates: Partial<AlertRule>): Promise<AlertRule | null> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.userId !== userId) return null;

    const updated: AlertRule = {
      ...alert,
      ...updates,
    };

    this.alerts.set(alertId, updated);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.set(`alert:${userId}:${alertId}`, updated);
    }

    return updated;
  }

  async deleteAlertRule(userId: string, alertId: string): Promise<boolean> {
    this.alerts.delete(alertId);

    if (this.config.storageAdapter) {
      await this.config.storageAdapter.remove(`alert:${userId}:${alertId}`);
    }

    return true;
  }

  async createCalorieExceedAlert(
    userId: string,
    thresholdPercent: number = 110
  ): Promise<AlertRule> {
    return this.createAlertRule({
      userId,
      type: 'calories_exceed',
      enabled: true,
      threshold: thresholdPercent,
      notificationChannel: 'push',
    });
  }

  async createWeightFluctuationAlert(
    userId: string,
    thresholdKg: number = 2
  ): Promise<AlertRule> {
    return this.createAlertRule({
      userId,
      type: 'weight_fluctuation',
      enabled: true,
      threshold: thresholdKg,
      notificationChannel: 'push',
    });
  }

  async checkDueReminders(userId: string, currentTime?: number): Promise<ReminderCheckResult> {
    const now = currentTime || getTimestamp();
    const nowDate = new Date(now);
    const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    const currentDay = nowDate.getDay();

    const reminders = await this.getReminders(userId);
    const dueReminders: Array<{ reminder: ReminderRule; dueAt: number; minutesUntilDue: number }> = [];
    const preMealReminders: Array<{ reminder: ReminderRule; mealType: MealType; minutesUntilMeal: number }> = [];

    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      if (reminder.repeatDays && !reminder.repeatDays.includes(currentDay)) continue;

      const [h, m] = reminder.time.split(':').map(Number);
      const reminderMinutes = h * 60 + m;

      if (reminder.preMealReminder && reminder.preMealMinutes) {
        const preMealTime = reminderMinutes - reminder.preMealMinutes;
        const minutesUntilMeal = reminderMinutes - currentMinutes;

        if (minutesUntilMeal > 0 && minutesUntilMeal <= reminder.preMealMinutes) {
          const mealType = this.getMealTypeFromLabel(reminder.label);
          preMealReminders.push({
            reminder,
            mealType,
            minutesUntilMeal,
          });
        }
      }

      const minutesDiff = reminderMinutes - currentMinutes;
      if (minutesDiff >= 0 && minutesDiff <= 5) {
        const dueAt = new Date(now);
        dueAt.setHours(h, m, 0, 0);

        dueReminders.push({
          reminder,
          dueAt: dueAt.getTime(),
          minutesUntilDue: minutesDiff,
        });
      }
    }

    return { dueReminders, preMealReminders };
  }

  private getMealTypeFromLabel(label?: string): MealType {
    if (!label) return MealType.SNACK;
    if (label.includes('早餐')) return MealType.BREAKFAST;
    if (label.includes('午餐')) return MealType.LUNCH;
    if (label.includes('晚餐')) return MealType.DINNER;
    return MealType.SNACK;
  }

  async checkAlerts(
    userId: string,
    todayNutrition: NutritionFacts,
    goals: UserGoals,
    weightRecords: WeightRecord[],
    todayMeals: MealRecord[]
  ): Promise<AlertCheckResult> {
    const alerts = await this.getAlertRules(userId);
    const triggeredAlerts: AlertCheckResult['triggeredAlerts'] = [];

    for (const alert of alerts) {
      if (!alert.enabled) continue;

      switch (alert.type) {
        case 'calories_exceed': {
          const threshold = alert.threshold || 110;
          const currentPercent = goals.dailyCalories > 0
            ? (todayNutrition.calories / goals.dailyCalories) * 100
            : 0;

          if (currentPercent >= threshold) {
            triggeredAlerts.push({
              alert,
              currentValue: roundTo(currentPercent, 1),
              threshold,
              message: `今日热量摄入已达${roundTo(currentPercent, 1)}%，超过${threshold}%的警戒线`,
            });
          }
          break;
        }

        case 'nutrient_exceed': {
          const nutrients: Array<{ key: keyof NutritionFacts; target: number; name: string }> = [
            { key: 'fat', target: goals.dailyFat, name: '脂肪' },
            { key: 'sugar', target: 50, name: '添加糖' },
            { key: 'sodium', target: 2000, name: '钠' },
          ];

          for (const { key, target, name } of nutrients) {
            const current = todayNutrition[key] || 0;
            const percent = target > 0 ? (current / target) * 100 : 0;

            if (percent >= 100) {
              triggeredAlerts.push({
                alert,
                currentValue: roundTo(percent, 1),
                threshold: 100,
                message: `${name}摄入已达${roundTo(percent, 1)}%，建议控制`,
              });
            }
          }
          break;
        }

        case 'weight_fluctuation': {
          if (weightRecords.length >= 2) {
            const recentWeights = weightRecords.slice(0, 7);
            const avgWeight = recentWeights.reduce((acc, w) => acc + w.weight, 0) / recentWeights.length;
            const latestWeight = weightRecords[0].weight;
            const fluctuation = Math.abs(latestWeight - avgWeight);
            const threshold = alert.threshold || 2;

            if (fluctuation >= threshold) {
              triggeredAlerts.push({
                alert,
                currentValue: roundTo(fluctuation, 2),
                threshold,
                message: `体重波动${roundTo(fluctuation, 2)}kg，超过${threshold}kg的正常波动范围`,
              });
            }
          }
          break;
        }

        case 'missing_meal': {
          const expectedMeals = goals.mealFrequency;
          const todayMealCount = todayMeals.length;

          if (todayMealCount < expectedMeals) {
            const now = new Date();
            const hour = now.getHours();

            if (hour >= 20) {
              triggeredAlerts.push({
                alert,
                currentValue: todayMealCount,
                threshold: expectedMeals,
                message: `今日仅记录${todayMealCount}餐，建议完成${expectedMeals}餐的目标`,
              });
            }
          }
          break;
        }
      }
    }

    return { triggeredAlerts };
  }

  async getDefaultReminderSetup(userId: string): Promise<ReminderRule[]> {
    const reminders: ReminderRule[] = [];

    reminders.push(await this.createPreMealReminder(userId, MealType.BREAKFAST, '08:00', 15));
    reminders.push(await this.createPreMealReminder(userId, MealType.LUNCH, '12:30', 15));
    reminders.push(await this.createPreMealReminder(userId, MealType.DINNER, '18:30', 15));

    const waterReminders = await this.createWaterReminder(userId, '09:00', '21:00', 3);
    reminders.push(...waterReminders);

    reminders.push(await this.createWeightReminder(userId, '08:00'));

    return reminders;
  }

  async getDefaultAlerts(userId: string): Promise<AlertRule[]> {
    const alerts: AlertRule[] = [];

    alerts.push(await this.createCalorieExceedAlert(userId, 110));
    alerts.push(await this.createWeightFluctuationAlert(userId, 2));

    alerts.push(await this.createAlertRule({
      userId,
      type: 'nutrient_exceed',
      enabled: true,
      threshold: 100,
      notificationChannel: 'push',
    }));

    alerts.push(await this.createAlertRule({
      userId,
      type: 'missing_meal',
      enabled: true,
      notificationChannel: 'push',
    }));

    return alerts;
  }

  async toggleReminder(userId: string, reminderId: string, enabled: boolean): Promise<ReminderRule | null> {
    return this.updateReminder(userId, reminderId, { enabled });
  }

  async toggleAlert(userId: string, alertId: string, enabled: boolean): Promise<AlertRule | null> {
    return this.updateAlertRule(userId, alertId, { enabled });
  }

  async getSnoozeTime(reminderId: string, snoozeMinutes: number = 5): Promise<number> {
    return getTimestamp() + snoozeMinutes * 60 * 1000;
  }
}
