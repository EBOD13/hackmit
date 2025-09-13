# POI Quest App - Implementation Plan

## Overview
A location-based quest app for MentraOS glasses that generates AI-powered challenges, awards points for completion, and gamifies real-world exploration.

## System Architecture Analysis

### Current Demo App Structure
- **Server**: Express.js for WebView config screen + MentraOS SDK for glasses display with TypeScript
- **Core Components**: AppServer, AppSession management, tool handlers, webview support
- **UI**: EJS templates with simple CSS styling
- **Config**: JSON-based app configuration with permissions/settings

### MentraOS Platform Capabilities
- **Location**: Continuous GPS tracking with accuracy tiers, single location fixes
- **Display**: TextWall, DoubleTextWall, ReferenceCard, DashboardCard layouts
- **Interaction**: Voice transcription, tool activation phrases, settings management
- **Session**: User session management with cleanup handlers

## Proposed POI Quest App Architecture

### Backend Server Components

#### 1. Database Layer (new)
- User profiles (ID, points, current quest, quest history)
- Quest templates (categories, difficulty levels, point values)
- Active quests (user, POI target, start time, status)
- POI cache (location, type, metadata, last updated)

#### 2. External APIs Integration (new)
Use Claude API, langchain, and these tools for quest generation and POI data:
- **Location API**: Google Places, Foursquare, or Yelp API for POI discovery
- **Weather API**: OpenWeatherMap for weather-aware quest generation
- **Time Context**: Local timezone and time-of-day awareness

#### 3. Quest Generation Engine (new)
- AI-powered quest generator using user location, time, weather, preferences
- Quest categories: food, exercise, exploration, culture, shopping
- Difficulty scaling based on distance, time, user fitness level

#### 4. Enhanced Tools (modify existing)
- `generate_quest` - Get new quest based on current context
- `complete_quest` - Mark quest complete and award points
- `view_leaderboard` - Show user ranking and stats
- `skip_quest` - Skip current quest (with penalty)

### MentraOS Glasses Interface

#### 1. Quest HUD Display
- `showReferenceCard()` for quest description and objective
- `showDashboardCard()` for points/progress tracking
- `showTextWall()` for navigation hints and completion messages

#### 2. Location Tracking
- Continuous location updates when quest is active
- Geofence detection for quest completion verification
- Battery-efficient "reduced" accuracy for background tracking

#### 3. Voice Interaction
- "Get new quest" - Triggers quest generation
- "Complete quest" - Marks current quest as done
- "Show progress" - Displays stats and points

### Mobile App/Web Interface

#### 1. Quest Management Dashboard
- Current active quest with map visualization
- Quest history and achievements
- Points leaderboard and social features
- Settings for quest preferences and difficulty

#### 2. Admin Functions
- Quest template management
- User analytics and engagement metrics
- POI database management

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Glasses MVP**
   - Adapt the example to display a hardcoded quest upon voice command
   - Log the current coordinates to the console for verification.

2. **Database Setup**
   - SQLite/PostgreSQL schema for users, quests, POIs
   - User authentication and session management
   - Basic CRUD operations

3. **Location API Integration**
   - Choose POI provider (Google Places recommended)
   - Implement POI fetching with caching
   - Location-based filtering and radius search

4. **Enhanced Tool Framework**
   - Add voice activation phrases (generate quest, complete quest) for quest interactions
   - Implement basic quest state management

### Phase 2: Quest Generation
1. **Context Collection**
   - Integrate weather API for environmental context
   - Time-of-day and day-of-week awareness
   - User preference learning system

2. **AI Quest Generator**
   - OpenAI/Claude API integration for creative quest generation
   - Template-based quest categories with AI enhancement
   - Difficulty scaling algorithms

3. **Quest Validation**
   - Distance feasibility checks
   - Business hours validation
   - Weather appropriateness filtering

### Phase 3: User Experience
1. **Glasses Interface Optimization**
   - Quest display layouts using MentraOS layout manager
   - Real-time progress updates
   - Completion celebration sequences

2. **Location Tracking Implementation**
   - Continuous GPS with smart power management
   - Geofence completion detection
   - Navigation hints and directions

3. **Gamification Features**
   - Point system with multipliers
   - Achievement badges and streaks
   - Social leaderboards

### Phase 4: Advanced Features
1. **Social Integration**
   - Friend challenges and group quests
   - Photo sharing for quest completion proof
   - Community-generated quest suggestions

2. **Personalization Engine**
   - Machine learning for quest recommendation
   - Adaptive difficulty based on completion patterns
   - Seasonal and event-based quest variations

3. **Analytics and Optimization**
   - User engagement tracking
   - Quest completion rate analysis
   - Performance optimization and caching

## Technical Implementation Priority

### Immediate Next Steps
1. Set up database schema and user management
2. Integrate Google Places API for POI fetching
3. Create basic quest generation with fixed templates
4. Add location tracking using MentraOS LocationManager
5. Design quest display layouts using available layout methods

## Key Features Summary
- **Location-aware**: Uses GPS and POI APIs to find nearby interesting locations
- **AI-powered**: Generates personalized quests based on context (time, weather, user preferences)
- **Gamified**: Points system with leaderboards and achievements
- **AR Integration**: Leverages MentraOS glasses for immersive quest display and interaction
- **Social**: Multiplayer features and community engagement
- **Adaptive**: Learning system that improves quest recommendations over time

This architecture leverages the existing MentraOS demo structure while adding the necessary components for a location-aware, AI-driven quest system that gamifies real-world exploration.
