# Quest HUD App - Demo Script

This script demonstrates the key features of the Quest HUD App.

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Mentra OS credentials
   ```

3. **Start the app:**
   ```bash
   bun run dev
   ```

4. **Start backend (optional):**
   ```bash
   bun run backend
   ```

## Demo Flow

### 1. App Startup
- App connects to Mentra OS
- Shows welcome message
- Displays voice command help
- Shows first available quest

### 2. Quest Interaction
- **Voice Command**: "Show Quests"
  - Displays available quests
  - Shows quest details and rewards

- **Voice Command**: "Accept Quest"
  - Accepts the current quest
  - Shows quest-specific instructions

### 3. Quest Completion

#### Photo Quests
- **Voice Command**: "Take Photo"
  - Shows photo prompt
  - Simulates photo capture
  - Completes quest and awards points

#### Action Quests
- **Voice Command**: "Mark Complete"
  - Shows action prompt
  - Simulates action completion
  - Completes quest and awards points

#### Location Quests
- Uses GPS to verify location
- Shows AR guidance to target
- Requires photo at location

### 4. Social Features
- **Voice Command**: "Show Streak"
  - Displays current streak
  - Shows total points and level

- **Voice Command**: "Show Leaderboard"
  - Shows top 5 players
  - Displays points and streaks

### 5. Help System
- **Voice Command**: "Help"
  - Shows all available commands
  - Provides usage examples

## Sample Quest Walkthrough

### Quest: "Ice Cream Adventure"
1. User says "Show Quests"
2. App displays quest details
3. User says "Accept Quest"
4. App shows action prompt: "Order an ice cream cone or cup from any ice cream shop"
5. User completes the action
6. User says "Mark Complete"
7. App awards 50 points and updates streak

### Quest: "Sunset Photo"
1. User says "Show Quests"
2. App displays quest details
3. User says "Accept Quest"
4. App shows photo prompt: "Take a photo of a sunset with interesting foreground elements"
5. User says "Take Photo"
6. App simulates photo capture
7. App awards 75 points and updates streak

## Technical Features Demonstrated

- **Mentra OS SDK Integration**: Native AR overlays
- **Voice Command Processing**: Real-time transcription
- **Quest Management**: Create, assign, complete quests
- **Location Services**: GPS-based verification
- **Social Features**: Streaks, leaderboards, points
- **HUD Overlays**: Multiple view types and positions
- **Real-time Updates**: Live quest status

## Troubleshooting

- **No voice response**: Check microphone permissions
- **Quest not appearing**: Check quest expiration
- **Location quests failing**: Ensure GPS is enabled
- **Connection issues**: Verify API keys

## Next Steps

1. Set up your Mentra OS developer account
2. Get your API credentials
3. Run the app and test with voice commands
4. Customize quests for your use case
5. Add your own quest types and features

Happy questing! 
