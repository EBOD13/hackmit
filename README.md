# Quest HUD App - Social AR Quest Platform

A prototype social HUD quest app built with Mentra OS SDK that allows users to complete real-world quests through AR overlays and voice commands.

## Features

### Core Features
- **Quest Management**: Create, assign, and complete photo-based, location-based, and action-based quests
- **Voice Commands**: Accept/decline quests, view stats, and complete quests using voice
- **Streak Tracking**: Track daily completion streaks and maintain leaderboards
- **Social Elements**: Mock friends system and competitive leaderboards

### HUD/AR Features (Mentra OS Specific)
- **AR Navigation**: Visual cues for location-based quests
- **HUD Overlays**: Streak counters, quest prompts, and notifications
- **Voice Integration**: Microphone support for hands-free interaction
- **Real-time Updates**: Live quest status and completion feedback

## Sample Quests

The app includes 5 preloaded sample quests:

1. **Ice Cream Adventure** (Action) - Order your favorite ice cream
2. **Sunset Photo** (Photo) - Capture a beautiful sunset
3. **Coffee Shop Visit** (Location) - Visit a local coffee shop
4. **Park Walk** (Action) - Take a 10-minute walk in a park
5. **Street Art Hunt** (Photo) - Find and photograph street art

## Voice Commands

- `"Accept Quest"` / `"Decline Quest"` - Respond to quest prompts
- `"Show Quests"` - View available quests
- `"Show Streak"` - View your current streak and points
- `"Show Leaderboard"` - View the top players
- `"Take Photo"` - Complete photo-based quests
- `"Mark Complete"` - Complete action-based quests
- `"Help"` - Show all available commands

## Setup Instructions

### Prerequisites
- Node.js and Bun installed
- Mentra OS developer account
- Mentra OS glasses or simulator

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd hackmit
   bun install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   PACKAGE_NAME=your-package-name
   MENTRAOS_API_KEY=your-api-key
   PORT=3000
   ```

3. **Get your API credentials:**
   - Visit [Mentra OS Console](https://console.mentra.glass/)
   - Create a new app and get your package name and API key
   - Add them to your `.env` file

4. **Start the development server:**
   ```bash
   bun run dev
   ```

5. **Test with Mentra OS:**
   - Connect your Mentra OS glasses or use the simulator
   - The app will automatically connect and show quest prompts
   - Use voice commands to interact with the app

## Project Structure

```
src/
 types/
    index.ts          # TypeScript type definitions
 components/           # HUD overlay components
 quests/              # Quest management logic
 services/            # Location and other services
 utils/               # Utility functions
 index.ts             # Main application entry point
```

## Technical Implementation

### Quest System
- **QuestManager**: Handles quest creation, assignment, and completion
- **Quest Types**: Photo, Location, and Action-based quests
- **Verification**: Location-based quests use GPS verification
- **Rewards**: Point-based reward system with difficulty scaling

### HUD Integration
- **Mentra OS SDK**: Native AR overlay support
- **View Types**: Different overlay positions (main, top-right, bottom-left, etc.)
- **Real-time Updates**: Live quest status and notifications
- **Voice Processing**: Real-time transcription and command handling

### Social Features
- **User Profiles**: Streak tracking, points, and level system
- **Leaderboards**: Competitive ranking system
- **Mock Friends**: Simulated social connections

## Development Notes

- The app uses in-memory storage for simplicity (replace with database in production)
- Location services require GPS permissions
- Voice commands are processed in real-time
- AR guidance is generated based on user location and quest targets

## Future Enhancements

- Database integration (Firebase, PocketBase, or PostgreSQL)
- Real photo capture and verification
- Push notifications for new quests
- Social features (friend requests, quest sharing)
- Advanced AR features (3D objects, animations)
- Quest creation tools for users
- Achievement system and badges

## Troubleshooting

- **Voice commands not working**: Check microphone permissions
- **Location quests failing**: Ensure GPS is enabled and accurate
- **Connection issues**: Verify API keys and network connectivity
- **Quest not appearing**: Check quest expiration times

## License

MIT License - see LICENSE file for details.
