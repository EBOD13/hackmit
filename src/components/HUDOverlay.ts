import { AppSession, ViewType } from '@mentra/sdk';
import { Quest, User, HUDNotification, ARGuidance } from '../types';

export class HUDOverlay {
  private session: AppSession;
  private currentUserId: string;
  private activeNotifications: Map<string, HUDNotification> = new Map();

  constructor(session: AppSession, userId: string) {
    this.session = session;
    this.currentUserId = userId;
  }

  showQuestPrompt(quest: Quest): void {
    const questText = ` NEW QUEST: ${quest.title}\n\n${quest.description}\n\nReward: ${quest.reward} points\nDifficulty: ${quest.difficulty.toUpperCase()}`;
    
    this.session.layouts.showTextWall(questText, {
      view: ViewType.MAIN,
      durationMs: 10000
    });

    // Add notification
    this.addNotification({
      id: `quest-${quest.id}`,
      type: 'quest',
      title: 'New Quest Available',
      message: quest.title,
      duration: 10000,
      priority: 'high'
    });
  }

  showStreakCounter(user: User): void {
    const streakText = ` STREAK: ${user.streak} days\n POINTS: ${user.totalPoints}\n LEVEL: ${user.level}`;
    
    this.session.layouts.showTextWall(streakText, {
      view: ViewType.TOP_RIGHT,
      durationMs: 5000
    });
  }

  showQuestCompletion(quest: Quest, pointsEarned: number): void {
    const completionText = ` QUEST COMPLETED!\n\n${quest.title}\n+${pointsEarned} points earned!`;
    
    this.session.layouts.showTextWall(completionText, {
      view: ViewType.MAIN,
      durationMs: 5000
    });

    this.addNotification({
      id: `completion-${quest.id}`,
      type: 'achievement',
      title: 'Quest Completed!',
      message: `+${pointsEarned} points earned`,
      duration: 5000,
      priority: 'high'
    });
  }

  showARGuidance(guidance: ARGuidance): void {
    const directionArrow = this.getDirectionArrow(guidance.direction);
    const guidanceText = ` ${guidance.targetLocation.name}\n${directionArrow} ${Math.round(guidance.distance)}m away\n\n${guidance.instructions}`;
    
    this.session.layouts.showTextWall(guidanceText, {
      view: ViewType.BOTTOM_LEFT,
      durationMs: 30000
    });
  }

  showVoiceCommandPrompt(): void {
    const voiceText = ` Say "Accept Quest" or "Decline Quest" to respond to quests\n\nOther commands:\n- "Show my streak"\n- "Show leaderboard"\n- "Take photo for quest"`;
    
    this.session.layouts.showTextWall(voiceText, {
      view: ViewType.BOTTOM_RIGHT,
      durationMs: 8000
    });
  }

  showLeaderboard(leaderboard: any[]): void {
    let leaderboardText = ' LEADERBOARD\n\n';
    leaderboard.slice(0, 5).forEach((entry, index) => {
      const medal = index === 0 ? '' : index === 1 ? '' : index === 2 ? '' : '';
      leaderboardText += `${medal} ${entry.username}: ${entry.points} pts (${entry.streak} streak)\n`;
    });
    
    this.session.layouts.showTextWall(leaderboardText, {
      view: ViewType.MAIN,
      durationMs: 10000
    });
  }

  showPhotoPrompt(quest: Quest): void {
    if (!quest.photoPrompt) return;
    
    const photoText = ` PHOTO QUEST: ${quest.title}\n\n${quest.photoPrompt}\n\nSay "Take Photo" when ready!`;
    
    this.session.layouts.showTextWall(photoText, {
      view: ViewType.MAIN,
      durationMs: 15000
    });
  }

  showActionPrompt(quest: Quest): void {
    if (!quest.actionPrompt) return;
    
    const actionText = ` ACTION QUEST: ${quest.title}\n\n${quest.actionPrompt}\n\nComplete the action and say "Mark Complete" when done!`;
    
    this.session.layouts.showTextWall(actionText, {
      view: ViewType.MAIN,
      durationMs: 15000
    });
  }

  showNotification(notification: HUDNotification): void {
    const notificationText = `${this.getNotificationIcon(notification.type)} ${notification.title}\n${notification.message}`;
    
    this.session.layouts.showTextWall(notificationText, {
      view: ViewType.TOP_LEFT,
      durationMs: notification.duration
    });

    this.activeNotifications.set(notification.id, notification);
    
    // Auto-remove notification after duration
    setTimeout(() => {
      this.activeNotifications.delete(notification.id);
    }, notification.duration);
  }

  showError(message: string): void {
    this.session.layouts.showTextWall(` ERROR: ${message}`, {
      view: ViewType.MAIN,
      durationMs: 3000
    });
  }

  showSuccess(message: string): void {
    this.session.layouts.showTextWall(` ${message}`, {
      view: ViewType.MAIN,
      durationMs: 3000
    });
  }

  private addNotification(notification: HUDNotification): void {
    this.activeNotifications.set(notification.id, notification);
    this.showNotification(notification);
  }

  private getDirectionArrow(direction: number): string {
    if (direction >= 337.5 || direction < 22.5) return '';
    if (direction >= 22.5 && direction < 67.5) return '';
    if (direction >= 67.5 && direction < 112.5) return '';
    if (direction >= 112.5 && direction < 157.5) return '';
    if (direction >= 157.5 && direction < 202.5) return '';
    if (direction >= 202.5 && direction < 247.5) return '';
    if (direction >= 247.5 && direction < 292.5) return '';
    if (direction >= 292.5 && direction < 337.5) return '';
    return '';
  }

  private getNotificationIcon(type: string): string {
    switch (type) {
      case 'quest': return '';
      case 'streak': return '';
      case 'achievement': return '';
      case 'friend': return '';
      default: return '';
    }
  }

  clearAllNotifications(): void {
    this.activeNotifications.clear();
  }

  getActiveNotifications(): HUDNotification[] {
    return Array.from(this.activeNotifications.values());
  }
}
