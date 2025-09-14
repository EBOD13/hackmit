export interface Challenge {
  id: string;
  title: string;
  description: string;
  type: 'weekly' | 'monthly' | 'special';
  category: 'restaurant' | 'cultural' | 'outdoor' | 'shopping' | 'any';
  target_value: number;
  current_progress: number;
  start_date: Date;
  end_date: Date;
  reward_points: number;
  participants: number;
  is_active: boolean;
  region?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  members: TeamMember[];
  total_points: number;
  quest_count: number;
  created_at: Date;
  region: string;
  is_active: boolean;
}

export interface TeamMember {
  user_id: string;
  display_name: string;
  joined_at: Date;
  contribution_points: number;
  quest_count: number;
  role: 'leader' | 'member';
}

export interface QuestRace {
  id: string;
  quest_template_id: number;
  title: string;
  description: string;
  start_time: Date;
  end_time: Date;
  participants: RaceParticipant[];
  winner_id?: string;
  completion_times: { [userId: string]: number }; // milliseconds
  is_active: boolean;
  region?: string;
}

export interface RaceParticipant {
  user_id: string;
  display_name: string;
  joined_at: Date;
  completed_at?: Date;
  completion_time?: number; // milliseconds
  position?: number;
}

export interface RegionalLeaderboard {
  region: string;
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  rankings: LeaderboardEntry[];
  last_updated: Date;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  points: number;
  quest_count: number;
  rank: number;
  team_name?: string;
  badges: string[];
}

export interface UserStats {
  user_id: string;
  display_name: string;
  total_points: number;
  quest_count: number;
  challenges_completed: number;
  team_id?: string;
  region: string;
  badges: string[];
  achievements: string[];
  current_streak: number;
  longest_streak: number;
  favorite_category: string;
  join_date: Date;
}

export class CompetitionService {
  /**
   * Get active challenges for a region
   */
  getActiveChallenges(region?: string): Challenge[] {
    // Mock data - in real implementation, this would query the database
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return [
      {
        id: 'weekly_restaurants',
        title: 'Restaurant Week Challenge',
        description: 'Community goal: Complete 1000 restaurant visits this week!',
        type: 'weekly',
        category: 'restaurant',
        target_value: 1000,
        current_progress: 347,
        start_date: weekStart,
        end_date: weekEnd,
        reward_points: 500,
        participants: 156,
        is_active: true,
        region: region
      },
      {
        id: 'monthly_cultural',
        title: 'Cultural Explorer',
        description: 'Visit 50 museums, galleries, or historical sites this month',
        type: 'monthly',
        category: 'cultural',
        target_value: 50,
        current_progress: 23,
        start_date: monthStart,
        end_date: monthEnd,
        reward_points: 1000,
        participants: 89,
        is_active: true,
        region: region
      },
      {
        id: 'special_outdoor',
        title: 'Nature Quest Marathon',
        description: 'Complete 25 outdoor quests before the season ends!',
        type: 'special',
        category: 'outdoor',
        target_value: 25,
        current_progress: 12,
        start_date: new Date('2024-09-01'),
        end_date: new Date('2024-11-30'),
        reward_points: 750,
        participants: 203,
        is_active: true,
        region: region
      }
    ];
  }

  /**
   * Get regional leaderboard
   */
  getRegionalLeaderboard(region: string, period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'weekly'): RegionalLeaderboard {
    // Mock data - in real implementation, this would query the database
    const mockRankings: LeaderboardEntry[] = [
      {
        user_id: 'user_001',
        display_name: 'QuestMaster_Alex',
        points: 2450,
        quest_count: 47,
        rank: 1,
        team_name: 'Urban Explorers',
        badges: ['🏆', '🎯', '⭐']
      },
      {
        user_id: 'user_002',
        display_name: 'AdventureSeeker',
        points: 2180,
        quest_count: 41,
        rank: 2,
        team_name: 'City Wanderers',
        badges: ['🎯', '⭐']
      },
      {
        user_id: 'user_003',
        display_name: 'LocalExplorer',
        points: 1920,
        quest_count: 38,
        rank: 3,
        badges: ['⭐']
      },
      {
        user_id: 'user_004',
        display_name: 'QuestRunner',
        points: 1750,
        quest_count: 35,
        rank: 4,
        team_name: 'Speed Demons',
        badges: ['🏃', '⭐']
      },
      {
        user_id: 'user_005',
        display_name: 'CultureBuff',
        points: 1680,
        quest_count: 32,
        rank: 5,
        team_name: 'History Hunters',
        badges: ['🏛️', '⭐']
      }
    ];

    return {
      region,
      period,
      rankings: mockRankings,
      last_updated: new Date()
    };
  }

  /**
   * Get active quest races
   */
  getActiveQuestRaces(region?: string): QuestRace[] {
    const now = new Date();
    const raceEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    return [
      {
        id: 'race_001',
        quest_template_id: 1,
        title: 'Coffee Shop Sprint',
        description: 'First to complete the "Local Coffee Discovery" quest wins!',
        start_time: new Date(now.getTime() - 30 * 60 * 1000), // Started 30 min ago
        end_time: raceEnd,
        participants: [
          {
            user_id: 'user_001',
            display_name: 'QuestMaster_Alex',
            joined_at: new Date(now.getTime() - 25 * 60 * 1000),
            completed_at: new Date(now.getTime() - 10 * 60 * 1000),
            completion_time: 15 * 60 * 1000, // 15 minutes
            position: 1
          },
          {
            user_id: 'user_002',
            display_name: 'AdventureSeeker',
            joined_at: new Date(now.getTime() - 20 * 60 * 1000)
          }
        ],
        completion_times: {
          'user_001': 15 * 60 * 1000
        },
        is_active: true,
        region: region
      }
    ];
  }

  /**
   * Get teams in a region
   */
  getTeamsInRegion(region: string): Team[] {
    return [
      {
        id: 'team_001',
        name: 'Urban Explorers',
        description: 'Discovering the hidden gems of the city, one quest at a time!',
        leader_id: 'user_001',
        members: [
          {
            user_id: 'user_001',
            display_name: 'QuestMaster_Alex',
            joined_at: new Date('2024-08-01'),
            contribution_points: 2450,
            quest_count: 47,
            role: 'leader'
          },
          {
            user_id: 'user_006',
            display_name: 'CityScout',
            joined_at: new Date('2024-08-15'),
            contribution_points: 1200,
            quest_count: 23,
            role: 'member'
          }
        ],
        total_points: 3650,
        quest_count: 70,
        created_at: new Date('2024-08-01'),
        region: region,
        is_active: true
      },
      {
        id: 'team_002',
        name: 'City Wanderers',
        description: 'Wandering through urban landscapes and finding adventure everywhere',
        leader_id: 'user_002',
        members: [
          {
            user_id: 'user_002',
            display_name: 'AdventureSeeker',
            joined_at: new Date('2024-08-05'),
            contribution_points: 2180,
            quest_count: 41,
            role: 'leader'
          }
        ],
        total_points: 2180,
        quest_count: 41,
        created_at: new Date('2024-08-05'),
        region: region,
        is_active: true
      }
    ];
  }

  /**
   * Get user statistics
   */
  getUserStats(userId: string): UserStats {
    // Mock data - in real implementation, this would query the database
    return {
      user_id: userId,
      display_name: 'QuestExplorer',
      total_points: 1250,
      quest_count: 25,
      challenges_completed: 3,
      team_id: 'team_001',
      region: 'Boston',
      badges: ['⭐', '🎯'],
      achievements: ['First Quest', 'Team Player', 'Challenge Conqueror'],
      current_streak: 5,
      longest_streak: 12,
      favorite_category: 'cultural',
      join_date: new Date('2024-07-15')
    };
  }

  /**
   * Join a challenge
   */
  joinChallenge(userId: string, challengeId: string): boolean {
    // In real implementation, this would update the database
    console.log(`User ${userId} joined challenge ${challengeId}`);
    return true;
  }

  /**
   * Join a team
   */
  joinTeam(userId: string, teamId: string): boolean {
    // In real implementation, this would update the database
    console.log(`User ${userId} joined team ${teamId}`);
    return true;
  }

  /**
   * Create a new team
   */
  createTeam(leaderId: string, name: string, description: string, region: string): Team {
    const newTeam: Team = {
      id: `team_${Date.now()}`,
      name,
      description,
      leader_id: leaderId,
      members: [{
        user_id: leaderId,
        display_name: 'TeamLeader',
        joined_at: new Date(),
        contribution_points: 0,
        quest_count: 0,
        role: 'leader'
      }],
      total_points: 0,
      quest_count: 0,
      created_at: new Date(),
      region,
      is_active: true
    };

    // In real implementation, this would save to database
    console.log(`Created new team: ${name}`);
    return newTeam;
  }

  /**
   * Join a quest race
   */
  joinQuestRace(userId: string, raceId: string, displayName: string): boolean {
    // In real implementation, this would update the database
    console.log(`User ${userId} (${displayName}) joined quest race ${raceId}`);
    return true;
  }

  /**
   * Record quest race completion
   */
  recordRaceCompletion(userId: string, raceId: string, completionTime: number): boolean {
    // In real implementation, this would update the database and rankings
    console.log(`User ${userId} completed race ${raceId} in ${completionTime}ms`);
    return true;
  }

  /**
   * Update challenge progress
   */
  updateChallengeProgress(challengeId: string, increment: number = 1): void {
    // In real implementation, this would update the database
    console.log(`Updated challenge ${challengeId} progress by ${increment}`);
  }

  /**
   * Award badge to user
   */
  awardBadge(userId: string, badge: string, reason: string): void {
    // In real implementation, this would update the database
    console.log(`Awarded badge ${badge} to user ${userId} for: ${reason}`);
  }
}
