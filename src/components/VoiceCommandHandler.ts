import { Quest } from '../types';
import { QuestManager } from '../quests/QuestManager';
import { HUDOverlay } from './HUDOverlay';

export class VoiceCommandHandler {
  private questManager: QuestManager;
  private hudOverlay: HUDOverlay;
  private currentUserId: string;
  private currentQuest: Quest | null = null;

  constructor(questManager: QuestManager, hudOverlay: HUDOverlay, userId: string) {
    this.questManager = questManager;
    this.hudOverlay = hudOverlay;
    this.currentUserId = userId;
  }

  handleVoiceCommand(transcription: string): void {
    const command = transcription.toLowerCase().trim();
    
    console.log('Voice command received:', command);

    // Quest acceptance/decline
    if (command.includes('accept quest') || command.includes('accept the quest')) {
      this.acceptCurrentQuest();
    } else if (command.includes('decline quest') || command.includes('decline the quest')) {
      this.declineCurrentQuest();
    }
    
    // Quest management
    else if (command.includes('show quests') || command.includes('show my quests')) {
      this.showUserQuests();
    } else if (command.includes('show available quests')) {
      this.showAvailableQuests();
    }
    
    // Quest completion
    else if (command.includes('take photo') || command.includes('take a photo')) {
      this.handlePhotoCapture();
    } else if (command.includes('mark complete') || command.includes('mark as complete')) {
      this.handleQuestCompletion();
    }
    
    // User stats
    else if (command.includes('show streak') || command.includes('show my streak')) {
      this.showUserStreak();
    } else if (command.includes('show leaderboard')) {
      this.showLeaderboard();
    } else if (command.includes('show points') || command.includes('show my points')) {
      this.showUserPoints();
    }
    
    // Help
    else if (command.includes('help') || command.includes('what can i say')) {
      this.showHelp();
    }
    
    // Default response
    else {
      this.hudOverlay.showError('Command not recognized. Say "help" for available commands.');
    }
  }

  private acceptCurrentQuest(): void {
    if (!this.currentQuest) {
      this.hudOverlay.showError('No quest available to accept. Say "show available quests" to see quests.');
      return;
    }

    const success = this.questManager.acceptQuest(this.currentQuest.id, this.currentUserId);
    if (success) {
      this.hudOverlay.showSuccess(`Quest "${this.currentQuest.title}" accepted!`);
      this.showQuestDetails(this.currentQuest);
    } else {
      this.hudOverlay.showError('Failed to accept quest. Please try again.');
    }
  }

  private declineCurrentQuest(): void {
    if (!this.currentQuest) {
      this.hudOverlay.showError('No quest available to decline.');
      return;
    }

    this.hudOverlay.showSuccess(`Quest "${this.currentQuest.title}" declined.`);
    this.currentQuest = null;
  }

  private showUserQuests(): void {
    const { active, completed } = this.questManager.getUserQuests(this.currentUserId);
    
    let questText = ' YOUR QUESTS\n\n';
    questText += `Active: ${active.length}\n`;
    questText += `Completed: ${completed.length}\n\n`;
    
    if (active.length > 0) {
      questText += 'Active Quests:\n';
      active.forEach(quest => {
        questText += ` ${quest.title} (${quest.reward} pts)\n`;
      });
    }

    this.hudOverlay.showNotification({
      id: 'user-quests',
      type: 'quest',
      title: 'Your Quests',
      message: questText,
      duration: 8000,
      priority: 'medium'
    });
  }

  private showAvailableQuests(): void {
    const quests = this.questManager.getAvailableQuests(this.currentUserId);
    
    if (quests.length === 0) {
      this.hudOverlay.showError('No available quests at the moment.');
      return;
    }

    // Show the first available quest
    this.currentQuest = quests[0];
    this.hudOverlay.showQuestPrompt(this.currentQuest);
  }

  private handlePhotoCapture(): void {
    if (!this.currentQuest || this.currentQuest.type !== 'photo') {
      this.hudOverlay.showError('No photo quest active. Say "show available quests" to see quests.');
      return;
    }

    this.hudOverlay.showPhotoPrompt(this.currentQuest);
    // In a real app, you'd trigger the camera here
    // For now, we'll simulate photo capture
    setTimeout(() => {
      this.simulatePhotoCapture();
    }, 2000);
  }

  private simulatePhotoCapture(): void {
    if (!this.currentQuest) return;

    // Simulate photo capture
    const photoData = 'simulated_photo_data_base64';
    const success = this.questManager.completeQuest(
      this.currentQuest.id, 
      this.currentUserId, 
      { type: 'photo', data: photoData }
    );

    if (success) {
      this.hudOverlay.showQuestCompletion(this.currentQuest, this.currentQuest.reward);
      this.currentQuest = null;
    } else {
      this.hudOverlay.showError('Failed to complete quest. Please try again.');
    }
  }

  private handleQuestCompletion(): void {
    if (!this.currentQuest) {
      this.hudOverlay.showError('No quest active to complete.');
      return;
    }

    if (this.currentQuest.type === 'action') {
      this.hudOverlay.showActionPrompt(this.currentQuest);
      // Simulate action completion
      setTimeout(() => {
        this.simulateActionCompletion();
      }, 1000);
    } else {
      this.hudOverlay.showError('This quest requires specific completion steps.');
    }
  }

  private simulateActionCompletion(): void {
    if (!this.currentQuest) return;

    const success = this.questManager.completeQuest(this.currentQuest.id, this.currentUserId);
    if (success) {
      this.hudOverlay.showQuestCompletion(this.currentQuest, this.currentQuest.reward);
      this.currentQuest = null;
    } else {
      this.hudOverlay.showError('Failed to complete quest. Please try again.');
    }
  }

  private showUserStreak(): void {
    const user = this.questManager.getUserById(this.currentUserId);
    if (user) {
      this.hudOverlay.showStreakCounter(user);
    } else {
      this.hudOverlay.showError('User not found.');
    }
  }

  private showLeaderboard(): void {
    const leaderboard = this.questManager.getLeaderboard(10);
    this.hudOverlay.showLeaderboard(leaderboard);
  }

  private showUserPoints(): void {
    const user = this.questManager.getUserById(this.currentUserId);
    if (user) {
      this.hudOverlay.showSuccess(`You have ${user.totalPoints} points!`);
    } else {
      this.hudOverlay.showError('User not found.');
    }
  }

  private showQuestDetails(quest: Quest): void {
    let detailsText = ` ${quest.title}\n\n${quest.description}\n\n`;
    
    if (quest.type === 'photo' && quest.photoPrompt) {
      detailsText += ` ${quest.photoPrompt}\n\n`;
    } else if (quest.type === 'action' && quest.actionPrompt) {
      detailsText += ` ${quest.actionPrompt}\n\n`;
    } else if (quest.type === 'location' && quest.location) {
      detailsText += ` ${quest.location.name}\n\n`;
    }

    detailsText += `Reward: ${quest.reward} points\n`;
    detailsText += `Difficulty: ${quest.difficulty.toUpperCase()}\n\n`;
    detailsText += `Say "Take Photo" for photo quests or "Mark Complete" for action quests.`;

    this.hudOverlay.showNotification({
      id: `quest-details-${quest.id}`,
      type: 'quest',
      title: 'Quest Details',
      message: detailsText,
      duration: 12000,
      priority: 'high'
    });
  }

  private showHelp(): void {
    const helpText = ` VOICE COMMANDS\n\nQuest Commands:\n "Accept Quest" / "Decline Quest"\n "Show Quests" / "Show Available Quests"\n "Take Photo" / "Mark Complete"\n\nStats Commands:\n "Show Streak" / "Show Points"\n "Show Leaderboard"\n\nOther:\n "Help" - Show this menu`;

    this.hudOverlay.showNotification({
      id: 'help',
      type: 'quest',
      title: 'Voice Commands',
      message: helpText,
      duration: 15000,
      priority: 'medium'
    });
  }

  setCurrentQuest(quest: Quest | null): void {
    this.currentQuest = quest;
  }
}
