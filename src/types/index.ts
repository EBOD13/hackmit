export interface Quest {
  id: string;
  title: string;
  description: string;
  type: "photo" | "location" | "action";
  reward: number;
  difficulty: "easy" | "medium" | "hard";
  location?: {
    latitude: number;
    longitude: number;
    radius: number; // in meters
    name: string;
  };
  photoPrompt?: string;
  actionPrompt?: string;
  completed: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface User {
  id: string;
  username: string;
  email: string;
  streak: number;
  totalPoints: number;
  level: number;
  avatar?: string;
  friends: string[]; // user IDs
  createdAt: Date;
}

export interface QuestCompletion {
  questId: string;
  userId: string;
  completedAt: Date;
  proof?: {
    type: "photo" | "location";
    data: string; // base64 image or location data
  };
  pointsEarned: number;
}

export interface Streak {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: Date;
  streakFreezeUsed: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  points: number;
  streak: number;
  rank: number;
  avatar?: string;
}

export interface HUDNotification {
  id: string;
  type: "quest" | "streak" | "achievement" | "friend";
  title: string;
  message: string;
  duration: number;
  priority: "low" | "medium" | "high";
}

export interface ARGuidance {
  questId: string;
  targetLocation: {
    latitude: number;
    longitude: number;
    name: string;
  };
  distance: number;
  direction: number; // bearing in degrees
  instructions: string;
}
