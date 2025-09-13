import { AppServer, AppSession, ViewType } from '@mentra/sdk';
import { Quest, User, HUDNotification, ARGuidance } from './types';

// Quest Manager
class QuestManager {
  private quests: Map<string, Quest> = new Map();
  private users: Map<string, User> = new Map();
  private currentUserId = 'user-1';

  constructor() {
    this.initializeSampleData();
  }

  private initializeSampleData(): void {
    // Sample Quests
    const sampleQuests: Quest[] = [
      {
        id: 'quest-1',
        title: 'Ice Cream Adventure',
        description: 'Find and order your favorite ice cream flavor',
        type: 'action',
        reward: 50,
        difficulty: 'easy',
        actionPrompt: 'Order an ice cream cone or cup from any ice cream shop',
        completed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      {
        id: 'quest-2',
        title: 'Sunset Photo',
        description: 'Capture a beautiful sunset photo',
        type: 'photo',
        reward: 75,
        difficulty: 'medium',
        photoPrompt: 'Take a photo of a sunset with interesting foreground elements',
        completed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
      },
      {
        id: 'quest-3',
        title: 'Coffee Shop Visit',
        description: 'Visit a local coffee shop and take a photo',
        type: 'location',
        reward: 100,
        difficulty: 'medium',
        location: {
          latitude: 42.3601,
          longitude: -71.0589,
          radius: 100,
          name: 'Downtown Coffee District'
        },
        photoPrompt: 'Take a photo inside or outside a coffee shop',
        completed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
      },
      {
        id: 'quest-4',
        title: 'Park Walk',
        description: 'Take a 10-minute walk in a local park',
        type: 'action',
        reward: 60,
        difficulty: 'easy',
        actionPrompt: 'Walk for at least 10 minutes in any park or green space',
        completed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
      },
      {
        id: 'quest-5',
        title: 'Street Art Hunt',
        description: 'Find and photograph interesting street art or murals',
        type: 'photo',
        reward: 120,
        difficulty: 'hard',
        photoPrompt: 'Find and photograph street art, murals, or graffiti',
        completed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 96 * 60 * 60 * 1000)
      }
    ];

    sampleQuests.forEach(quest => this.quests.set(quest.id, quest));

    // Sample Users
    const sampleUsers: User[] = [
      {
        id: 'user-1',
        username: 'QuestMaster',
        email: 'questmaster@example.com',
        streak: 5,
        totalPoints: 1250,
        level: 3,
        friends: ['user-2', 'user-3'],
        createdAt: new Date()
      },
      {
        id: 'user-2',
        username: 'AdventureSeeker',
        email: 'adventure@example.com',
        streak: 3,
        totalPoints: 890,
        level: 2,
        friends: ['user-1', 'user-3'],
        createdAt: new Date()
      },
      {
        id: 'user-3',
        username: 'PhotoHunter',
        email: 'photo@example.com',
        streak: 7,
        totalPoints: 2100,
        level: 4,
        friends: ['user-1', 'user-2'],
        createdAt: new Date()
      }
    ];

    sampleUsers.forEach(user => this.users.set(user.id, user));
  }

  getAvailableQuests(): Quest[] {
    return Array.from(this.quests.values())
      .filter(quest => !quest.completed)
      .filter(quest => !quest.expiresAt || quest.expiresAt > new Date());
  }

  getQuestById(questId: string): Quest | undefined {
    return this.quests.get(questId);
  }

  acceptQuest(questId: string): boolean {
    const quest = this.quests.get(questId);
    return quest && !quest.completed;
  }

  completeQuest(questId: string): boolean {
    const quest = this.quests.get(questId);
    const user = this.users.get(this.currentUserId);
    
    if (!quest || !user || quest.completed) return false;

    quest.completed = true;
    user.totalPoints += quest.reward;
    user.streak += 1;
    return true;
  }

  getUser(): User | undefined {
    return this.users.get(this.currentUserId);
  }

  getLeaderboard(): any[] {
    return Array.from(this.users.values())
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 5)
      .map((user, index) => ({ ...user, rank: index + 1 }));
  }
}

// HUD Overlay Manager
class HUDOverlay {
  private session: AppSession;

  constructor(session: AppSession) {
    this.session = session;
  }

  showQuestPrompt(quest: Quest): void {
    const questText = ` NEW QUEST: ${quest.title}\n\n${quest.description}\n\nReward: ${quest.reward} points\nDifficulty: ${quest.difficulty.toUpperCase()}`;
    
    this.session.layouts.showTextWall(questText, {
      view: ViewType.MAIN,
      durationMs: 10000
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
  }

  showVoiceCommandPrompt(): void {
    const voiceText = ` VOICE COMMANDS\n\n "Accept Quest" / "Decline Quest"\n "Show Quests"\n "Show Streak"\n "Show Leaderboard"\n "Take Photo"\n "Mark Complete"\n "Help"`;
    
    this.session.layouts.showTextWall(voiceText, {
      view: ViewType.BOTTOM_RIGHT,
      durationMs: 10000
    });
  }

  showLeaderboard(leaderboard: any[]): void {
    let leaderboardText = ' LEADERBOARD\n\n';
    leaderboard.forEach((entry, index) => {
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
}

// Voice Command Handler
class VoiceCommandHandler {
  private questManager: QuestManager;
  private hudOverlay: HUDOverlay;
  private currentQuest: Quest | null = null;

  constructor(questManager: QuestManager, hudOverlay: HUDOverlay) {
    this.questManager = questManager;
    this.hudOverlay = hudOverlay;
  }

  handleVoiceCommand(transcription: string): void {
    const command = transcription.toLowerCase().trim();
    console.log('Voice command received:', command);

    if (command.includes('accept quest') || command.includes('accept the quest')) {
      this.acceptCurrentQuest();
    } else if (command.includes('decline quest') || command.includes('decline the quest')) {
      this.declineCurrentQuest();
    } else if (command.includes('show quests') || command.includes('show my quests')) {
      this.showAvailableQuests();
    } else if (command.includes('show streak') || command.includes('show my streak')) {
      this.showUserStreak();
    } else if (command.includes('show leaderboard')) {
      this.showLeaderboard();
    } else if (command.includes('take photo') || command.includes('take a photo')) {
      this.handlePhotoCapture();
    } else if (command.includes('mark complete') || command.includes('mark as complete')) {
      this.handleQuestCompletion();
    } else if (command.includes('help') || command.includes('what can i say')) {
      this.showHelp();
    } else {
      this.hudOverlay.showError('Command not recognized. Say "help" for available commands.');
    }
  }

  private acceptCurrentQuest(): void {
    if (!this.currentQuest) {
      this.hudOverlay.showError('No quest available to accept. Say "show quests" to see available quests.');
      return;
    }

    const success = this.questManager.acceptQuest(this.currentQuest.id);
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

  private showAvailableQuests(): void {
    const quests = this.questManager.getAvailableQuests();
    
    if (quests.length === 0) {
      this.hudOverlay.showError('No available quests at the moment.');
      return;
    }

    this.currentQuest = quests[0];
    this.hudOverlay.showQuestPrompt(this.currentQuest);
  }

  private handlePhotoCapture(): void {
    if (!this.currentQuest || this.currentQuest.type !== 'photo') {
      this.hudOverlay.showError('No photo quest active. Say "show quests" to see available quests.');
      return;
    }

    this.hudOverlay.showPhotoPrompt(this.currentQuest);
    // Simulate photo capture
    setTimeout(() => {
      this.simulatePhotoCapture();
    }, 2000);
  }

  private simulatePhotoCapture(): void {
    if (!this.currentQuest) return;

    const success = this.questManager.completeQuest(this.currentQuest.id);
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
      setTimeout(() => {
        this.simulateActionCompletion();
      }, 1000);
    } else {
      this.hudOverlay.showError('This quest requires specific completion steps.');
    }
  }

  private simulateActionCompletion(): void {
    if (!this.currentQuest) return;

    const success = this.questManager.completeQuest(this.currentQuest.id);
    if (success) {
      this.hudOverlay.showQuestCompletion(this.currentQuest, this.currentQuest.reward);
      this.currentQuest = null;
    } else {
      this.hudOverlay.showError('Failed to complete quest. Please try again.');
    }
  }

  private showUserStreak(): void {
    const user = this.questManager.getUser();
    if (user) {
      this.hudOverlay.showStreakCounter(user);
    } else {
      this.hudOverlay.showError('User not found.');
    }
  }

  private showLeaderboard(): void {
    const leaderboard = this.questManager.getLeaderboard();
    this.hudOverlay.showLeaderboard(leaderboard);
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

    this.hudOverlay.showSuccess(detailsText);
  }

  private showHelp(): void {
    this.hudOverlay.showVoiceCommandPrompt();
  }
}

// Main Quest App
class QuestApp extends AppServer {
  private questManager: QuestManager;
  private hudOverlay: HUDOverlay | null = null;
  private voiceHandler: VoiceCommandHandler | null = null;

  constructor() {
    super({
      packageName: process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })(),
      apiKey: process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })(),
      port: parseInt(process.env.PORT || '3000'),
    });
    
    this.questManager = new QuestManager();
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session started: ${sessionId} for user: ${userId}`);
    
    // Initialize HUD overlay and voice handler
    this.hudOverlay = new HUDOverlay(session);
    this.voiceHandler = new VoiceCommandHandler(this.questManager, this.hudOverlay);

    // Show welcome message
    session.layouts.showTextWall(" QUEST HUD APP READY!\n\nSay 'help' for voice commands or 'show quests' to start!", {
      view: ViewType.MAIN,
      durationMs: 5000
    });

    // Show voice command prompt
    setTimeout(() => {
      this.hudOverlay?.showVoiceCommandPrompt();
    }, 2000);

    // Handle real-time transcription
    session.events.onTranscription((data) => {
      if (data.isFinal && this.voiceHandler) {
        this.voiceHandler.handleVoiceCommand(data.text);
      }
    });

    // Handle glasses battery updates
    session.events.onGlassesBattery((data) => {
      console.log('Glasses battery:', data);
    });

    // Show initial quest
    setTimeout(() => {
      const quests = this.questManager.getAvailableQuests();
      if (quests.length > 0) {
        this.hudOverlay?.showQuestPrompt(quests[0]);
      }
    }, 3000);
  }
}

// Start the Quest App
const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

const app = new QuestApp();
app.start().catch(console.error);

console.log(' Quest HUD App started!');
console.log(' DEV CONSOLE URL: https://console.mentra.glass/');
console.log(' Ready to accept quests via voice commands!');
