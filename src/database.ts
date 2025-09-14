import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import path from 'path';

export interface User {
  id: string;
  total_points: number;
  quests_completed: number;
  daily_quest_count: number;
  max_daily_quests: number;
  last_quest_date: string | null;
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
            daily_quest_count INTEGER DEFAULT 0,
            max_daily_quests INTEGER DEFAULT 0,
            last_quest_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Add new columns to existing users table if they don't exist
        this.db.run(`ALTER TABLE users ADD COLUMN daily_quest_count INTEGER DEFAULT 0`, (err) => {
          // Ignore error if column already exists
        });
        this.db.run(`ALTER TABLE users ADD COLUMN max_daily_quests INTEGER DEFAULT 0`, (err) => {
          // Ignore error if column already exists
        });

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

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
        daily_quest_count: 0,
        max_daily_quests: 0,
        last_quest_date: null,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };

      this.db.run(
        `INSERT OR IGNORE INTO users (id, total_points, quests_completed, daily_quest_count, max_daily_quests, last_quest_date, created_at, last_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.total_points, user.quests_completed, user.daily_quest_count, user.max_daily_quests, user.last_quest_date, user.created_at, user.last_active],
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

  /**
   * Update user's daily quest count when they complete a quest
   */
  async updateUserStreak(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      this.db.serialize(() => {
        // First, get current user data
        this.db.get(
          `SELECT daily_quest_count, max_daily_quests, last_quest_date FROM users WHERE id = ?`,
          [userId],
          (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (!row) {
              reject(new Error('User not found'));
              return;
            }

            let newDailyCount = 1; // Start with 1 for today's quest
            
            // If last quest was today, increment the daily count
            if (row.last_quest_date === today) {
              newDailyCount = row.daily_quest_count + 1;
            }
            // If last quest was not today, reset to 1

            const newMaxDailyQuests = Math.max(newDailyCount, row.max_daily_quests);

            // Update user with new daily quest data
            this.db.run(
              `UPDATE users SET 
               daily_quest_count = ?, 
               max_daily_quests = ?, 
               last_quest_date = ?,
               last_active = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [newDailyCount, newMaxDailyQuests, today, userId],
              (updateErr) => {
                if (updateErr) reject(updateErr);
                else resolve();
              }
            );
          }
        );
      });
    });
  }

  /**
   * Reset daily quest counts for users who haven't completed a quest today
   */
  async resetExpiredStreaks(): Promise<void> {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      
      this.db.run(
        `UPDATE users SET daily_quest_count = 0 
         WHERE last_quest_date IS NOT NULL 
         AND last_quest_date < ?`,
        [today],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get yesterday's date in YYYY-MM-DD format
   */
  private getYesterday(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  // Quest template operations
  async createQuestTemplate(template: Omit<QuestTemplate, 'id' | 'created_at'>): Promise<QuestTemplate> {
    return new Promise((resolve, reject) => {
      const id = `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const created_at = new Date().toISOString();

      this.db.run(
        `INSERT INTO quest_templates (id, title, description, category, points, location_name, location_address, location_lat, location_lng, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, template.title, template.description, template.category, template.points,
         template.location_name, template.location_address, template.location_lat, template.location_lng, created_at],
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
          else resolve(row || null);
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

        // Get user ID for streak update
        this.db.get(
          `SELECT user_id FROM active_quests WHERE id = ?`,
          [questId],
          (err, row: any) => {
            if (err) {
              reject(err);
              return;
            }

            if (!row) {
              reject(new Error('Quest not found'));
              return;
            }

            const userId = row.user_id;

            // Update user points and quest count
            this.db.run(
              `UPDATE users SET
               total_points = total_points + ?,
               quests_completed = quests_completed + 1,
               last_active = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [pointsEarned, userId],
              (updateErr) => {
                if (updateErr) {
                  reject(updateErr);
                  return;
                }

                // Update streak after successful quest completion
                this.updateUserStreak(userId)
                  .then(() => resolve())
                  .catch((streakErr) => {
                    console.warn('Failed to update streak:', streakErr);
                    resolve(); // Don't fail the quest completion if streak update fails
                  });
              }
            );
          }
        );
      });
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

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close(() => resolve());
    });
  }
}