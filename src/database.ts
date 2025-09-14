import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';

export interface User {
  id: string;
  total_points: number;
  quests_completed: number;
  current_streak: number;
  last_quest_date: string;
  created_at: string;
  last_active: string;
}

export interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  points: number;
  location_name: string;
  location_address: string;
  location_lat?: number;
  location_lng?: number;
  weather_dependent?: boolean;
  suitable_weather?: string[] | string;
  indoor_activity?: boolean;
  historical_significance?: string;
  cultural_info?: string;
  required_items?: string[] | string;
  created_at: string;
}

export interface ActiveQuest {
  id: string;
  user_id: string;
  quest_template_id: string;
  status: 'active' | 'completed' | 'abandoned';
  started_at: string;
  completed_at?: string;
  points_earned?: number;
}

export interface POICache {
  id: string;
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_type: string;
  rating?: number;
  price_level?: number;
  last_updated: string;
}

export class QuestDatabase {
  private db: Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(__dirname, '../data/quests.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Users table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            total_points INTEGER DEFAULT 0,
            quests_completed INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            last_quest_date TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Add new columns to existing users table if they don't exist
        this.db.run(`ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0`, () => {});
        this.db.run(`ALTER TABLE users ADD COLUMN last_quest_date TEXT DEFAULT ''`, () => {});

        // Quest templates table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS quest_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            points INTEGER NOT NULL,
            location_name TEXT NOT NULL,
            location_address TEXT NOT NULL,
            location_lat REAL,
            location_lng REAL,
            weather_dependent INTEGER DEFAULT 0,
            suitable_weather TEXT,
            indoor_activity INTEGER DEFAULT 0,
            historical_significance TEXT,
            cultural_info TEXT,
            required_items TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Competition tables
        
        // Challenges table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS challenges (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('weekly', 'monthly', 'special')),
            category TEXT NOT NULL,
            target_value INTEGER NOT NULL,
            current_progress INTEGER DEFAULT 0,
            start_date DATETIME NOT NULL,
            end_date DATETIME NOT NULL,
            reward_points INTEGER NOT NULL,
            participants INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            region TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Teams table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            leader_id TEXT NOT NULL,
            total_points INTEGER DEFAULT 0,
            quest_count INTEGER DEFAULT 0,
            region TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (leader_id) REFERENCES users(id)
          )
        `);

        // Team members table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS team_members (
            team_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            contribution_points INTEGER DEFAULT 0,
            quest_count INTEGER DEFAULT 0,
            role TEXT DEFAULT 'member' CHECK (role IN ('leader', 'member')),
            PRIMARY KEY (team_id, user_id),
            FOREIGN KEY (team_id) REFERENCES teams(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // Quest races table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS quest_races (
            id TEXT PRIMARY KEY,
            quest_template_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            winner_id TEXT,
            is_active INTEGER DEFAULT 1,
            region TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (quest_template_id) REFERENCES quest_templates(id),
            FOREIGN KEY (winner_id) REFERENCES users(id)
          )
        `);

        // Race participants table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS race_participants (
            race_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            completion_time INTEGER,
            position INTEGER,
            PRIMARY KEY (race_id, user_id),
            FOREIGN KEY (race_id) REFERENCES quest_races(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // User achievements table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS user_achievements (
            user_id TEXT NOT NULL,
            achievement_type TEXT NOT NULL,
            achievement_name TEXT NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            PRIMARY KEY (user_id, achievement_type, achievement_name),
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // Challenge participants table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS challenge_participants (
            challenge_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            contribution INTEGER DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (challenge_id, user_id),
            FOREIGN KEY (challenge_id) REFERENCES challenges(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // User profiles table for display names and regions
        this.db.run(`
          CREATE TABLE IF NOT EXISTS user_profiles (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            region TEXT NOT NULL,
            favorite_category TEXT,
            longest_streak INTEGER DEFAULT 0,
            badges TEXT DEFAULT '[]',
            join_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // Add new columns to existing quest_templates table if they don't exist
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN weather_dependent INTEGER DEFAULT 0`, () => {});
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN suitable_weather TEXT`, () => {});
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN indoor_activity INTEGER DEFAULT 0`, () => {});
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN historical_significance TEXT`, () => {});
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN cultural_info TEXT`, () => {});
        this.db.run(`ALTER TABLE quest_templates ADD COLUMN required_items TEXT`, () => {});

        // Active quests table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS active_quests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            quest_template_id TEXT NOT NULL,
            status TEXT CHECK(status IN ('active', 'completed', 'abandoned')) DEFAULT 'active',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            points_earned INTEGER,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (quest_template_id) REFERENCES quest_templates (id)
          )
        `);

        // POI cache table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS poi_cache (
            id TEXT PRIMARY KEY,
            place_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            place_type TEXT NOT NULL,
            rating REAL,
            price_level INTEGER,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  // User operations
  async createUser(userId: string): Promise<User> {
    return new Promise((resolve, reject) => {
      const user: User = {
        id: userId,
        total_points: 0,
        quests_completed: 0,
        current_streak: 0,
        last_quest_date: '',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      this.db.run(
        `INSERT OR IGNORE INTO users (id, total_points, quests_completed, current_streak, last_quest_date, created_at, last_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.total_points, user.quests_completed, user.current_streak, user.last_quest_date, user.created_at, user.last_active],
        function(err) {
          if (err) reject(err);
          else resolve(user);
        }
      );
    });
  }

  async getUser(userId: string): Promise<User | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM users WHERE id = ?`,
        [userId],
        (err, row: User) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async updateUserLastActive(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?`,
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Quest template operations
  async createQuestTemplate(template: Omit<QuestTemplate, 'id' | 'created_at'>): Promise<QuestTemplate> {
    return new Promise((resolve, reject) => {
      const id = `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const created_at = new Date().toISOString();

      this.db.run(
        `INSERT INTO quest_templates (id, title, description, category, points, location_name, location_address, location_lat, location_lng, 
         weather_dependent, suitable_weather, indoor_activity, historical_significance, cultural_info, required_items, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, template.title, template.description, template.category, template.points,
         template.location_name, template.location_address, template.location_lat, template.location_lng,
         template.weather_dependent ? 1 : 0, JSON.stringify(template.suitable_weather || []), 
         template.indoor_activity ? 1 : 0, template.historical_significance || '', 
         template.cultural_info || '', JSON.stringify(template.required_items || []), created_at],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...template, created_at });
        }
      );
    });
  }

  async getQuestTemplatesByCategory(category: string, limit: number = 10): Promise<QuestTemplate[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM quest_templates WHERE category = ? ORDER BY RANDOM() LIMIT ?`,
        [category, limit],
        (err, rows: QuestTemplate[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getRandomQuestTemplate(): Promise<QuestTemplate | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM quest_templates ORDER BY RANDOM() LIMIT 1`,
        (err, row: QuestTemplate) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async getQuestTemplateById(templateId: string): Promise<QuestTemplate | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM quest_templates WHERE id = ?`,
        [templateId],
        (err, row: QuestTemplate) => {
          if (err) reject(err);
          else {
            if (row) {
              // Parse JSON fields
              row.suitable_weather = typeof row.suitable_weather === 'string' ? JSON.parse(row.suitable_weather) : row.suitable_weather || [];
              row.required_items = typeof row.required_items === 'string' ? JSON.parse(row.required_items) : row.required_items || [];
              row.weather_dependent = Boolean(row.weather_dependent);
              row.indoor_activity = Boolean(row.indoor_activity);
            }
            resolve(row || null);
          }
        }
      );
    });
  }

  async getWeatherAppropriateQuests(weatherCondition: string, isRaining: boolean = false): Promise<QuestTemplate[]> {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM quest_templates WHERE `;
      let params: any[] = [];

      if (isRaining) {
        // If raining, prioritize indoor activities
        query += `indoor_activity = 1 OR (weather_dependent = 0)`;
      } else {
        // If not raining, include outdoor activities suitable for current weather
        query += `(indoor_activity = 1) OR 
                  (weather_dependent = 0) OR 
                  (weather_dependent = 1 AND (suitable_weather LIKE ? OR suitable_weather LIKE ?))`;
        params.push(`%"${weatherCondition}"%`, `%"any"%`);
      }
      
      query += ` ORDER BY RANDOM() LIMIT 10`;

      this.db.all(query, params, (err, rows: QuestTemplate[]) => {
        if (err) reject(err);
        else {
          // Parse JSON fields for each row
          const parsedRows = rows.map(row => ({
            ...row,
            suitable_weather: typeof row.suitable_weather === 'string' ? JSON.parse(row.suitable_weather) : row.suitable_weather || [],
            required_items: typeof row.required_items === 'string' ? JSON.parse(row.required_items) : row.required_items || [],
            weather_dependent: Boolean(row.weather_dependent),
            indoor_activity: Boolean(row.indoor_activity)
          }));
          resolve(parsedRows || []);
        }
      });
    });
  }

  async getHistoricalQuests(limit: number = 5): Promise<QuestTemplate[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM quest_templates WHERE historical_significance IS NOT NULL AND historical_significance != '' ORDER BY RANDOM() LIMIT ?`,
        [limit],
        (err, rows: QuestTemplate[]) => {
          if (err) reject(err);
          else {
            const parsedRows = rows.map(row => ({
              ...row,
              suitable_weather: typeof row.suitable_weather === 'string' ? JSON.parse(row.suitable_weather) : row.suitable_weather || [],
              required_items: typeof row.required_items === 'string' ? JSON.parse(row.required_items) : row.required_items || [],
              weather_dependent: Boolean(row.weather_dependent),
              indoor_activity: Boolean(row.indoor_activity)
            }));
            resolve(parsedRows || []);
          }
        }
      );
    });
  }

  async getCulturalQuests(limit: number = 5): Promise<QuestTemplate[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM quest_templates WHERE cultural_info IS NOT NULL AND cultural_info != '' ORDER BY RANDOM() LIMIT ?`,
        [limit],
        (err, rows: QuestTemplate[]) => {
          if (err) reject(err);
          else {
            const parsedRows = rows.map(row => ({
              ...row,
              suitable_weather: typeof row.suitable_weather === 'string' ? JSON.parse(row.suitable_weather) : row.suitable_weather || [],
              required_items: typeof row.required_items === 'string' ? JSON.parse(row.required_items) : row.required_items || [],
              weather_dependent: Boolean(row.weather_dependent),
              indoor_activity: Boolean(row.indoor_activity)
            }));
            resolve(parsedRows || []);
          }
        }
      );
    });
  }

  // Active quest operations
  async createActiveQuest(userId: string, questTemplateId: string): Promise<ActiveQuest> {
    return new Promise((resolve, reject) => {
      const id = `active_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const started_at = new Date().toISOString();

      this.db.run(
        `INSERT INTO active_quests (id, user_id, quest_template_id, status, started_at)
         VALUES (?, ?, ?, 'active', ?)`,
        [id, userId, questTemplateId, started_at],
        function(err) {
          if (err) reject(err);
          else resolve({
            id,
            user_id: userId,
            quest_template_id: questTemplateId,
            status: 'active',
            started_at
          });
        }
      );
    });
  }

  async getUserActiveQuest(userId: string): Promise<ActiveQuest | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM active_quests WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
        [userId],
        (err, row: ActiveQuest) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async completeQuest(questId: string, pointsEarned: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const completed_at = new Date().toISOString();

      this.db.serialize(() => {
        // Update quest status
        this.db.run(
          `UPDATE active_quests SET status = 'completed', completed_at = ?, points_earned = ? WHERE id = ?`,
          [completed_at, pointsEarned, questId]
        );

        // Update user points, quest count, and streak
        this.db.run(
          `UPDATE users SET
           total_points = total_points + ?,
           quests_completed = quests_completed + 1,
           current_streak = CASE 
             WHEN date(last_quest_date) = date('now', '-1 day') OR last_quest_date = '' 
             THEN current_streak + 1 
             WHEN date(last_quest_date) = date('now') 
             THEN current_streak 
             ELSE 1 
           END,
           last_quest_date = date('now'),
           last_active = CURRENT_TIMESTAMP
           WHERE id = (SELECT user_id FROM active_quests WHERE id = ?)`,
          [pointsEarned, questId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  }

  async abandonQuest(questId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const abandoned_at = new Date().toISOString();

      this.db.run(
        `UPDATE active_quests SET status = 'abandoned', completed_at = ? WHERE id = ?`,
        [abandoned_at, questId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // POI cache operations
  async cachePOI(poi: Omit<POICache, 'id' | 'last_updated'>): Promise<POICache> {
    return new Promise((resolve, reject) => {
      const id = `poi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const last_updated = new Date().toISOString();

      this.db.run(
        `INSERT OR REPLACE INTO poi_cache (id, place_id, name, address, lat, lng, place_type, rating, price_level, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, poi.place_id, poi.name, poi.address, poi.lat, poi.lng, poi.place_type, poi.rating, poi.price_level, last_updated],
        function(err) {
          if (err) reject(err);
          else resolve({ id, ...poi, last_updated });
        }
      );
    });
  }

  async getPOIsNearLocation(lat: number, lng: number, radiusKm: number = 5, limit: number = 10): Promise<POICache[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT *,
         (6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) AS distance
         FROM poi_cache
         WHERE distance <= ?
         ORDER BY distance
         LIMIT ?`,
        [lat, lng, lat, radiusKm, limit],
        (err, rows: POICache[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getAllUsersLeaderboard(): Promise<Array<{id: string, total_points: number, quests_completed: number}>> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT id, total_points, quests_completed 
         FROM users 
         ORDER BY total_points DESC, quests_completed DESC`,
        [],
        (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  async getRecentQuestCategories(userId: string, limit: number = 3): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT DISTINCT qt.category
         FROM active_quests aq
         JOIN quest_templates qt ON aq.quest_template_id = qt.id
         WHERE aq.user_id = ? AND aq.status = 'completed'
         ORDER BY aq.completed_at DESC
         LIMIT ?`,
        [userId, limit],
        (err, rows: { category: string }[]) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.category));
        }
      );
    });
  }

  // Competition-related database methods

  async createUserProfile(userId: string, displayName: string, region: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO user_profiles (user_id, display_name, region) VALUES (?, ?, ?)`,
        [userId, displayName, region],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserProfile(userId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT up.*, u.total_points, u.quests_completed, u.current_streak 
         FROM user_profiles up 
         JOIN users u ON up.user_id = u.id 
         WHERE up.user_id = ?`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  async getRegionalLeaderboard(region: string, limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT up.display_name, u.total_points, u.quests_completed, up.badges,
                tm.team_id, t.name as team_name
         FROM user_profiles up
         JOIN users u ON up.user_id = u.id
         LEFT JOIN team_members tm ON up.user_id = tm.user_id
         LEFT JOIN teams t ON tm.team_id = t.id
         WHERE up.region = ?
         ORDER BY u.total_points DESC, u.quests_completed DESC
         LIMIT ?`,
        [region, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async createChallenge(challenge: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO challenges (id, title, description, type, category, target_value, 
         start_date, end_date, reward_points, region) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [challenge.id, challenge.title, challenge.description, challenge.type, 
         challenge.category, challenge.target_value, challenge.start_date, 
         challenge.end_date, challenge.reward_points, challenge.region],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getActiveChallenges(region?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = region 
        ? `SELECT * FROM challenges WHERE is_active = 1 AND (region = ? OR region IS NULL) AND end_date > datetime('now')`
        : `SELECT * FROM challenges WHERE is_active = 1 AND end_date > datetime('now')`;
      
      this.db.all(query, region ? [region] : [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async joinChallenge(userId: string, challengeId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO challenge_participants (challenge_id, user_id) VALUES (?, ?)`,
        [challengeId, userId],
        (err) => {
          if (err) reject(err);
          else {
            // Update participant count
            this.db.run(
              `UPDATE challenges SET participants = participants + 1 WHERE id = ?`,
              [challengeId]
            );
            resolve();
          }
        }
      );
    });
  }

  async updateChallengeProgress(challengeId: string, increment: number = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE challenges SET current_progress = current_progress + ? WHERE id = ?`,
        [increment, challengeId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async createTeam(team: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(
          `INSERT INTO teams (id, name, description, leader_id, region) VALUES (?, ?, ?, ?, ?)`,
          [team.id, team.name, team.description, team.leader_id, team.region]
        );
        
        this.db.run(
          `INSERT INTO team_members (team_id, user_id, display_name, role) VALUES (?, ?, ?, 'leader')`,
          [team.id, team.leader_id, team.leader_display_name || 'Leader'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  }

  async joinTeam(userId: string, teamId: string, displayName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO team_members (team_id, user_id, display_name) VALUES (?, ?, ?)`,
        [teamId, userId, displayName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getTeamsInRegion(region: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT t.*, COUNT(tm.user_id) as member_count
         FROM teams t
         LEFT JOIN team_members tm ON t.id = tm.team_id
         WHERE t.region = ? AND t.is_active = 1
         GROUP BY t.id
         ORDER BY t.total_points DESC`,
        [region],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async createQuestRace(race: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO quest_races (id, quest_template_id, title, description, start_time, end_time, region) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [race.id, race.quest_template_id, race.title, race.description, 
         race.start_time, race.end_time, race.region],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async joinQuestRace(userId: string, raceId: string, displayName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO race_participants (race_id, user_id, display_name) VALUES (?, ?, ?)`,
        [raceId, userId, displayName],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async recordRaceCompletion(userId: string, raceId: string, completionTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE race_participants 
         SET completed_at = datetime('now'), completion_time = ? 
         WHERE race_id = ? AND user_id = ?`,
        [completionTime, raceId, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getActiveQuestRaces(region?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const query = region 
        ? `SELECT * FROM quest_races WHERE is_active = 1 AND (region = ? OR region IS NULL) AND end_time > datetime('now')`
        : `SELECT * FROM quest_races WHERE is_active = 1 AND end_time > datetime('now')`;
      
      this.db.all(query, region ? [region] : [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async awardAchievement(userId: string, achievementType: string, achievementName: string, description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR IGNORE INTO user_achievements (user_id, achievement_type, achievement_name, description) 
         VALUES (?, ?, ?, ?)`,
        [userId, achievementType, achievementName, description],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUserAchievements(userId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM user_achievements WHERE user_id = ? ORDER BY earned_at DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }
}