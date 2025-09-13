import express from 'express';
import cors from 'cors';
import { Quest, User, QuestCompletion } from '../src/types';

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

app.use(cors());
app.use(express.json());

// Mock database
let quests: Quest[] = [];
let users: User[] = [];
let completions: QuestCompletion[] = [];

// Initialize sample data
const initializeData = () => {
  quests = [
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

  users = [
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
};

// API Routes

// Get all available quests
app.get('/api/quests', (req, res) => {
  const availableQuests = quests.filter(quest => 
    !quest.completed && 
    (!quest.expiresAt || quest.expiresAt > new Date())
  );
  res.json(availableQuests);
});

// Get quest by ID
app.get('/api/quests/:id', (req, res) => {
  const quest = quests.find(q => q.id === req.params.id);
  if (!quest) {
    return res.status(404).json({ error: 'Quest not found' });
  }
  res.json(quest);
});

// Accept a quest
app.post('/api/quests/:id/accept', (req, res) => {
  const quest = quests.find(q => q.id === req.params.id);
  if (!quest) {
    return res.status(404).json({ error: 'Quest not found' });
  }
  if (quest.completed) {
    return res.status(400).json({ error: 'Quest already completed' });
  }
  res.json({ success: true, message: 'Quest accepted' });
});

// Complete a quest
app.post('/api/quests/:id/complete', (req, res) => {
  const quest = quests.find(q => q.id === req.params.id);
  const userId = req.body.userId || 'user-1';
  const user = users.find(u => u.id === userId);
  
  if (!quest) {
    return res.status(404).json({ error: 'Quest not found' });
  }
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (quest.completed) {
    return res.status(400).json({ error: 'Quest already completed' });
  }

  // Mark quest as completed
  quest.completed = true;

  // Create completion record
  const completion: QuestCompletion = {
    questId: quest.id,
    userId: userId,
    completedAt: new Date(),
    proof: req.body.proof,
    pointsEarned: quest.reward
  };
  completions.push(completion);

  // Update user stats
  user.totalPoints += quest.reward;
  user.streak += 1;

  res.json({ 
    success: true, 
    message: 'Quest completed!',
    pointsEarned: quest.reward,
    newTotal: user.totalPoints
  });
});

// Get user by ID
app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = users
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 10)
    .map((user, index) => ({
      ...user,
      rank: index + 1
    }));
  res.json(leaderboard);
});

// Get user quests
app.get('/api/users/:id/quests', (req, res) => {
  const userId = req.params.id;
  const userCompletions = completions.filter(c => c.userId === userId);
  const completedQuestIds = new Set(userCompletions.map(c => c.questId));
  
  const active = quests.filter(quest => 
    !completedQuestIds.has(quest.id) && !quest.completed
  );
  
  const completed = quests.filter(quest => 
    completedQuestIds.has(quest.id)
  );

  res.json({ active, completed });
});

// Verify location quest
app.post('/api/quests/:id/verify-location', (req, res) => {
  const quest = quests.find(q => q.id === req.params.id);
  const { latitude, longitude } = req.body;
  
  if (!quest || quest.type !== 'location' || !quest.location) {
    return res.status(400).json({ error: 'Not a location quest' });
  }

  const distance = calculateDistance(
    latitude, longitude,
    quest.location.latitude, quest.location.longitude
  );

  const isValid = distance <= quest.location.radius;
  
  res.json({ 
    isValid, 
    distance, 
    requiredRadius: quest.location.radius 
  });
});

// Helper function to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Initialize data and start server
initializeData();

app.listen(PORT, () => {
  console.log(` Quest HUD Backend running on port ${PORT}`);
  console.log(` API available at http://localhost:${PORT}/api`);
  console.log(` Sample quests loaded: ${quests.length}`);
  console.log(` Sample users loaded: ${users.length}`);
});

export default app;
