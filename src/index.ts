import { ToolCall, AppServer, AppSession } from '@mentra/sdk';
import path from "path";
import { setupExpressRoutes } from "./webview";
import { handleToolCall } from "./tools";
import { QuestDatabase, User, QuestTemplate, ActiveQuest } from "./database";
import { GooglePlacesService, QuestLocation } from "./places-service";

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error("PACKAGE_NAME is not set in .env file");
  })();
const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error("MENTRAOS_API_KEY is not set in .env file");
  })();
const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ??
  (() => {
    throw new Error("GOOGLE_PLACES_API_KEY is not set in .env file");
  })();
const PORT = parseInt(process.env.PORT || "3000");

class ExampleMentraOSApp extends AppServer {
  private database: QuestDatabase;
  private placesService: GooglePlacesService;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, "../public"),
    });

    // Set up database
    this.database = new QuestDatabase();

    // Set up Google Places service
    this.placesService = new GooglePlacesService(
      GOOGLE_PLACES_API_KEY,
      this.database
    );

    // Set up Express routes
    setupExpressRoutes(this);
  }

  /** Map to store active user sessions */
  private userSessionsMap = new Map<string, AppSession>();

  /** Map to store user's last known location */
  private userLocationsMap = new Map<
    string,
    { lat: number; lng: number; timestamp: Date }
  >();

  /** Map to store last distance notification time to prevent spam */
  private lastDistanceNotificationMap = new Map<string, number>();

  private questTTSPlayedMap = new Map<string, string>(); // Track which quests have had TTS played

  private lastTTSTimeMap = new Map<string, number>(); // Track last TTS time for debouncing
  private activeTTSMap = new Map<string, boolean>(); // Track if TTS is currently playing for a user

  /**
   * Play TTS with debounce protection to prevent overlapping audio
   * @param session - The app session
   * @param text - Text to speak
   * @param options - Voice settings options
   * @param forcePlay - Whether to bypass debounce (for critical messages)
   * @returns Promise<boolean> - Whether TTS was played
   */
  private async playTTSWithDebounce(
    session: AppSession,
    text: string,
    options?: any,
    forcePlay: boolean = false
  ): Promise<boolean> {
    const userId = Array.from(this.userSessionsMap.entries())
      .find(([_, sess]) => sess === session)?.[0];
    
    if (!userId) return false;
    
    const now = Date.now();
    const lastTTSTime = this.lastTTSTimeMap.get(userId) || 0;
    const isCurrentlyPlaying = this.activeTTSMap.get(userId) || false;
    const debounceDelay = 2000; // 2 seconds debounce
    
    // Check if we should play TTS
    const timeSinceLastTTS = now - lastTTSTime;
    const shouldPlay = forcePlay || (!isCurrentlyPlaying && timeSinceLastTTS > debounceDelay);
    
    if (!shouldPlay) {
      session.logger.info("TTS skipped due to debounce", {
        timeSinceLastTTS,
        isCurrentlyPlaying,
        forcePlay,
        text: text.substring(0, 30) + "..."
      });
      return false;
    }
    
    try {
      // Mark as playing and update timestamp BEFORE starting TTS
      this.activeTTSMap.set(userId, true);
      this.lastTTSTimeMap.set(userId, now);
      
      await session.audio.speak(text, options);
      
      session.logger.info("TTS played successfully", { text: text.substring(0, 50) + "..." });
      
      // Keep the debounce active for a short period after TTS completes
      setTimeout(() => {
        this.activeTTSMap.set(userId, false);
      }, 500); // 500ms buffer after TTS completes
      
      return true;
    } catch (error) {
      session.logger.warn("Failed to play TTS", { error, text: text.substring(0, 50) + "..." });
      // Reset immediately on error
      this.activeTTSMap.set(userId, false);
      return false;
    }
  }

  /**
   * Get a random quest template from database
   */
  private async getRandomQuestTemplate(): Promise<QuestTemplate | null> {
    try {
      return await this.database.getRandomQuestTemplate();
    } catch (error) {
      console.error("Error fetching quest template:", error);
      return null;
    }
  }

  /**
   * Generate a location-aware quest using Google Places API
   */
  private async generateLocationAwareQuest(
    lat: number,
    lng: number,
    session: AppSession
  ): Promise<QuestTemplate | null> {
    try {
      session.logger.info("Generating location-aware quest", { lat, lng });

      const questLocations = await this.placesService.findQuestLocations(
        lat,
        lng
      );

      if (questLocations.length === 0) {
        session.logger.warn(
          "No quest locations found nearby, falling back to database"
        );
        return await this.getRandomQuestTemplate();
      }

      // Pick a random quest location
      const randomLocation =
        questLocations[Math.floor(Math.random() * questLocations.length)];
      const questData = this.placesService.generateQuestDescription(
        randomLocation.place,
        randomLocation.questType
      );

      // Save the generated quest template to database FIRST
      const questTemplate = await this.database.createQuestTemplate({
        title: questData.title,
        description: questData.description,
        category: randomLocation.category,
        points: questData.points,
        location_name: randomLocation.place.name,
        location_address: randomLocation.place.formatted_address,
        location_lat: randomLocation.place.geometry.location.lat,
        location_lng: randomLocation.place.geometry.location.lng,
      });

      session.logger.info("Generated location-aware quest", {
        questId: questTemplate.id,
        place: randomLocation.place.name,
        category: randomLocation.category,
        distance: this.calculateDistance(
          lat,
          lng,
          questTemplate.location_lat!,
          questTemplate.location_lng!
        ),
      });

      return questTemplate;
    } catch (error) {
      session.logger.error("Error generating location-aware quest", { error });
      // Fallback to database quest
      return await this.getRandomQuestTemplate();
    }
  }

  /**
   * Create a new active quest for the user
   */
  private async createActiveQuestForUser(
    userId: string,
    questTemplate: QuestTemplate
  ): Promise<ActiveQuest | null> {
    try {
      return await this.database.createActiveQuest(userId, questTemplate.id);
    } catch (error) {
      console.error("Error creating active quest:", error);
      return null;
    }
  }

  /**
   * Wrap text into a list of lines with a maximum line length (respecting newlines)
   * @param text
   */
  private wrapText(text: string, maxLineLength: number = 36): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      if ((currentLine + word).length > maxLineLength || word.includes("\n")) {
        lines.push(currentLine.trim());
        currentLine = word + " ";
      } else {
        currentLine += word + " ";
      }
    }
    lines.push(currentLine.trim());
    return lines;
  }

  /**
   * Display scrolling text for content that exceeds 5 lines
   */
  private async displayScrollingText(
    session: AppSession,
    title: string,
    content: string,
    maxLinesPerScreen: number = 3,
    scrollDelay: number = 1000
  ): Promise<void> {
    const userId = Array.from(this.userSessionsMap.entries())
      .find(([_, sess]) => sess === session)?.[0];
    
    const lines = this.wrapText(content);
    console.log("Wrapped lines:", lines.join("\n"));

    // If content fits in one screen, show normally
    if (lines.length <= maxLinesPerScreen) {
      session.layouts.showReferenceCard(title, content, { durationMs: -1 });
      return;
    }

    session.logger.info("Displaying scrolling text", {
      totalLines: lines.length,
      maxLinesPerScreen,
      scrollDelay,
    });

    // Show initial screen first (lines 0-4)
    let currentWindow = lines.slice(0, maxLinesPerScreen);
    session.layouts.showReferenceCard(title, currentWindow.join("\n"), {
      durationMs: scrollDelay * 1.5,
    });

    // Wait before starting to scroll
    await new Promise((resolve) => setTimeout(resolve, scrollDelay));

    // Scroll through the content one line at a time
    const totalScrollPositions = lines.length - maxLinesPerScreen + 1;

    for (let position = 1; position < totalScrollPositions; position++) {
      const windowLines = lines.slice(position, position + maxLinesPerScreen);
      const windowContent = windowLines.join("\n");

      // Show this scroll position
      const isLastPosition = position === totalScrollPositions - 1;
      const displayDuration = isLastPosition
        ? scrollDelay * 4
        : scrollDelay * 1.5; // Last position stays up

      session.layouts.showReferenceCard(title, windowContent, {
        durationMs: displayDuration,
      });

      // Wait before scrolling to next position (except for last)
      if (!isLastPosition) {
        await new Promise((resolve) => setTimeout(resolve, scrollDelay));
      }
    }
  }

  /**
   * Display a quest template to the user using MentraOS layouts with scrolling for long content
   */
  private async displayQuestTemplate(
    session: AppSession,
    questTemplate: QuestTemplate,
    userLocation?: { lat: number; lng: number }
  ): Promise<void> {
    // Build quest content
    let distanceInfo = "";
    if (
      userLocation &&
      questTemplate.location_lat &&
      questTemplate.location_lng
    ) {
      const distance = this.calculateDistance(
        userLocation.lat,
        userLocation.lng,
        questTemplate.location_lat,
        questTemplate.location_lng
      );
      distanceInfo = `\n📏 Distance: ${(distance * 1000).toFixed(0)}m away`;
    }

    const questContent = `${questTemplate.description}\n\n📍 Location: ${questTemplate.location_name}\n${questTemplate.location_address}${distanceInfo}\n\n🏆 Points: ${questTemplate.points}`;

    // Use scrolling display for long content
    await this.displayScrollingText(
      session,
      `🎯 ${questTemplate.title}`,
      questContent
    );


    session.logger.info("Quest displayed", {
      questId: questTemplate.id,
      title: questTemplate.title,
      category: questTemplate.category
    });
  }

  /**
   * Get user from database or create if doesn't exist
   */
  private async getOrCreateUser(userId: string): Promise<User> {
    try {
      let user = await this.database.getUser(userId);
      if (!user) {
        user = await this.database.createUser(userId);
      } else {
        await this.database.updateUserLastActive(userId);
      }
      return user;
    } catch (error) {
      console.error("Error with user operations:", error);
      throw error;
    }
  }

  /**
   * Handles tool calls from the MentraOS system
   * @param toolCall - The tool call request
   * @returns Promise resolving to the tool call response or undefined
   */
  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    return handleToolCall(
      toolCall,
      toolCall.userId,
      this.userSessionsMap.get(toolCall.userId)
    );
  }

  /**
   * Handles new user sessions
   * Sets up event listeners and displays welcome message
   * @param session - The app session instance
   * @param sessionId - Unique session identifier
   * @param userId - User identifier
   */
  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    this.userSessionsMap.set(userId, session);

    // Initialize database and create/get user
    try {
      await this.database.initialize();
      const user = await this.getOrCreateUser(userId);
      session.logger.info("User initialized", {
        userId,
        totalPoints: user.total_points,
        questsCompleted: user.quests_completed,
      });

      // Show welcome message with user stats
      session.layouts.showTextWall(
        `🎮 POI Quest App loaded!\n\n👤 Total Points: ${user.total_points}\n🏆 Quests Completed: ${user.quests_completed}\n\nSay 'new quest' to begin your adventure!`,
        { durationMs: 5000 }
      );
    } catch (error) {
      session.logger.error("Failed to initialize user", { error });
      session.layouts.showTextWall("⚠️ Database error. Using offline mode.", {
        durationMs: 3000,
      });
    }

    // Start location tracking for quest completion verification
    let stopLocationUpdates: (() => void) | null = null;
    try {
      stopLocationUpdates = session.location.subscribeToStream(
        { accuracy: "reduced" },
        (locationData) => {
          console.log("📍 Current Location:", {
            latitude: locationData.lat,
            longitude: locationData.lng,
            accuracy: locationData.accuracy,
            timestamp: locationData.timestamp ? new Date(locationData.timestamp).toLocaleString() : 'Unknown',
          });

          // Store user's current location
          this.userLocationsMap.set(userId, {
            lat: locationData.lat,
            lng: locationData.lng,
            timestamp: new Date(),
          });

          // Check if user is near their quest location (async operation)
          this.checkQuestProximity(userId, locationData, session).catch(
            (error) => {
              session.logger.warn("Error checking quest location proximity", {
                error,
              });
            }
          );
        }
      );
      session.logger.info("Location tracking started");
    } catch (error) {
      session.logger.warn("Failed to start location tracking", { error });
    }

    /**
     * Handles quest-related voice commands
     * @param text - The transcription text to process
     */
    const handleQuestCommands = async (text: string): Promise<void> => {
      const normalizedText = text.toLowerCase().trim();

      if (
        normalizedText.includes("new quest") ||
        normalizedText.includes("get quest") ||
        normalizedText.includes("start quest")
      ) {
        try {
          // Check if user already has an active quest
          const existingQuest = await this.database.getUserActiveQuest(userId);
          if (existingQuest) {
            session.layouts.showTextWall(
              "You already have an active quest! Say 'current quest' to see it or 'complete quest' to finish it.",
              { durationMs: 4000 }
            );
            return;
          }

          // Try to generate a location-aware quest
          const userLocation = this.userLocationsMap.get(userId);
          let questTemplate: QuestTemplate | null = null;

          if (userLocation) {
            session.layouts.showTextWall("🔍 Finding nearby adventures...", {
              durationMs: 2000,
            });
            questTemplate = await this.generateLocationAwareQuest(
              userLocation.lat,
              userLocation.lng,
              session
            );
          } else {
            session.logger.info("No location available, using random quest");
            questTemplate = await this.getRandomQuestTemplate();
          }

          if (questTemplate) {
            const activeQuest = await this.createActiveQuestForUser(
              userId,
              questTemplate
            );
            if (activeQuest) {
              // Display quest with scrolling support
              await this.displayQuestTemplate(
                session,
                questTemplate,
                userLocation || undefined
              );

              session.logger.info("Quest assigned", {
                questId: questTemplate.id,
                title: questTemplate.title,
                category: questTemplate.category,
                isLocationAware: !!userLocation,
              });
            } else {
              session.layouts.showTextWall(
                "Failed to create quest. Please try again.",
                { durationMs: 3000 }
              );
            }
          } else {
            session.layouts.showTextWall(
              "No quests available. Please try again later.",
              { durationMs: 3000 }
            );
          }
        } catch (error) {
          session.logger.error("Error creating new quest", { error });
          session.layouts.showTextWall(
            "Error creating quest. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("current quest") ||
        normalizedText.includes("my quest") ||
        normalizedText.includes("show quest")
      ) {
        try {
          const activeQuest = await this.database.getUserActiveQuest(userId);
          if (activeQuest) {
            // Get the actual quest template for the active quest
            const questTemplate = await this.database.getQuestTemplateById(
              activeQuest.quest_template_id
            );
            if (questTemplate) {
              const userLocation = this.userLocationsMap.get(userId);
              await this.displayQuestTemplate(
                session,
                questTemplate,
                userLocation
              );
            } else {
              session.layouts.showTextWall("Error loading quest details.", {
                durationMs: 3000,
              });
            }
          } else {
            session.layouts.showTextWall(
              "You don't have an active quest. Say 'new quest' to get one!",
              { durationMs: 3000 }
            );
          }
        } catch (error) {
          session.logger.error("Error fetching current quest", { error });
          session.layouts.showTextWall(
            "Error fetching quest. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("complete quest") ||
        normalizedText.includes("finish quest")
      ) {
        try {
          const activeQuest = await this.database.getUserActiveQuest(userId);
          if (activeQuest) {
            // Get the quest template to get the correct point value
            const questTemplate = await this.database.getQuestTemplateById(
              activeQuest.quest_template_id
            );
            const points = questTemplate?.points || 100; // Fallback to 100 if template not found

            await this.database.completeQuest(activeQuest.id, points);

            // Get updated user stats
            const user = await this.database.getUser(userId);

            // Play celebration audio
            await this.playTTSWithDebounce(
              session,
              `Quest completed! You earned ${points} points. Your total is now ${user?.total_points || 0} points.`,
              {
                voice_settings: {
                  stability: 0.4,
                  similarity_boost: 0.85,
                  style: 0.8,
                  speed: 1.0
                }
              },
              true // Force play for quest completion
            );

            session.layouts.showReferenceCard(
              "🎉 Quest Completed!",
              `Congratulations! You earned ${points} points for completing "${
                questTemplate?.title || "your quest"
              }"!\n\n📊 Total Points: ${
                user?.total_points || 0
              }\n🏆 Quests Completed: ${
                user?.quests_completed || 0
              }\n\nSay 'new quest' for your next adventure.`,
              { durationMs: 5000 }
            );

            session.logger.info("Quest completed", {
              questId: activeQuest.id,
              questTitle: questTemplate?.title,
              points,
              totalPoints: user?.total_points,
            });
          } else {
            session.layouts.showTextWall(
              "No active quest to complete. Say 'new quest' to get one!",
              { durationMs: 3000 }
            );
          }
        } catch (error) {
          session.logger.error("Error completing quest", { error });
          session.layouts.showTextWall(
            "Error completing quest. Please try again.",
            { durationMs: 3000 }
          );
        }
      }
    };

    /**
     * Handles transcription display based on settings
     * @param text - The transcription text to display
     */
    const displayTranscription = (text: string): void => {
      const showLiveTranscription = session.settings.get<boolean>(
        "show_live_transcription",
        true
      );
      if (showLiveTranscription) {
        console.log("Transcript received:", text);
        // session.layouts.showTextWall("You said: " + text);
      }
    };

    // Listen for transcriptions
    session.events.onTranscription(async (data) => {
      if (data.isFinal) {
        // Then handle regular transcription display
        displayTranscription(data.text);
        // Handle quest commands first
        await handleQuestCommands(data.text);
        
        // Handle voice commands
        const lowerText = data.text.toLowerCase().trim();
        
        // Get userId for debouncing
        const userId = Array.from(this.userSessionsMap.entries())
          .find(([_, sess]) => sess === session)?.[0];
        
        if (userId) {
          
          if (lowerText.includes("new quest") || lowerText.includes("next quest")) {
            await this.playTTSWithDebounce(session, "Finding your next adventure!", {
              voice_settings: { stability: 0.6, speed: 1.1 }
            });
          } else if (lowerText.includes("complete quest") || lowerText.includes("finish quest")) {
            // No TTS confirmation for quest completion
          } else if (lowerText.includes("show distance") || lowerText.includes("how far")) {
            await this.playTTSWithDebounce(session, "Calculating your location...", {
              voice_settings: { stability: 0.6, speed: 1.1 }
            });
            // Show distance to quest location
            await this.showDistanceCardForUser(userId, session);
          } else if (lowerText.includes("show leaderboard") || lowerText.includes("get leaderboard") || lowerText.includes("rankings")) {
            await this.playTTSWithDebounce(session, "Checking the rankings...", {
              voice_settings: { stability: 0.6, speed: 1.1 }
            });
            // Always execute the leaderboard command regardless of TTS debounce
            await this.showLeaderboard(session);
          }
        }
      }
    });

    // Listen for setting changes to update transcription display behavior
    session.settings.onValueChange(
      "show_live_transcription",
      (newValue: boolean, oldValue: boolean) => {
        console.log(
          `Live transcription setting changed from ${oldValue} to ${newValue}`
        );
        if (newValue) {
          console.log("Live transcription display enabled");
        } else {
          console.log("Live transcription display disabled");
        }
      }
    );

    // automatically remove the session when the session ends
    this.addCleanupHandler(() => {
      this.userSessionsMap.delete(userId);
      this.userLocationsMap.delete(userId);
      this.questTTSPlayedMap.delete(userId); // Clean up TTS tracking
      this.lastTTSTimeMap.delete(userId); // Clean up TTS debounce tracking
      this.activeTTSMap.delete(userId); // Clean up active TTS tracking
      
      if (stopLocationUpdates) {
        stopLocationUpdates();
      }
    });
  }

  /**
   * Show leaderboard with all users' points
   */
  private async showLeaderboard(session: AppSession): Promise<void> {
    try {
      const users = await this.database.getAllUsersLeaderboard();
      
      if (users.length === 0) {
        session.layouts.showTextWall(
          "🏆 Leaderboard\n\nNo users found yet!\nComplete some quests to appear on the leaderboard.",
          { durationMs: 4000 }
        );
        return;
      }

      // Build leaderboard content
      let leaderboardContent = "🏆 Quest Leaderboard\n\n";
      
      users.forEach((user, index) => {
        const rank = index + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
        const userId = user.id.length > 12 ? `${user.id.substring(0, 12)}...` : user.id;
        
        leaderboardContent += `${medal} ${userId}\n`;
        leaderboardContent += `   Points: ${user.total_points}\n\n`;
      });

      // Use scrolling display for long leaderboards
      await this.displayScrollingText(
        session,
        "🏆 Quest Leaderboard",
        leaderboardContent.trim()
      );

      session.logger.info("Leaderboard displayed", {
        totalUsers: users.length,
        topUser: users[0]?.id,
        topPoints: users[0]?.total_points
      });
    } catch (error) {
      session.logger.error("Error showing leaderboard", { error });
      session.layouts.showTextWall(
        "Error loading leaderboard. Please try again.",
        { durationMs: 3000 }
      );
    }
  }


  /**
   * Show distance card for a specific user
   */
  private async showDistanceCardForUser(userId: string, session: AppSession): Promise<void> {
    try {
      const activeQuest = await this.database.getUserActiveQuest(userId);
      if (activeQuest) {
        const questTemplate = await this.database.getQuestTemplateById(
          activeQuest.quest_template_id
        );
        const userLocation = this.userLocationsMap.get(userId);
        
        if (questTemplate && questTemplate.location_lat && questTemplate.location_lng && userLocation) {
          const distance = this.calculateDistance(
            userLocation.lat,
            userLocation.lng,
            questTemplate.location_lat,
            questTemplate.location_lng
          );
          
          const distanceInMeters = Math.round(distance * 1000);
          
          if (distance <= 0.1) {
            const message = `🎯 Quest Location Nearby!\nYou're ${distanceInMeters}m away from your quest destination!`;
            session.layouts.showTextWall(message, { durationMs: 3000 });
            
            // Audio notification for nearby location
            await this.playTTSWithDebounce(session, `You're very close! Only ${distanceInMeters} meters to your quest destination.`, {
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.8,
                style: 0.7,
                speed: 1.1
              }
            });
          } else {
            const distanceText = distance < 1 
              ? `${distanceInMeters}m` 
              : `${distance.toFixed(1)}km`;
            
            session.layouts.showTextWall(
              `📍 Quest Distance: ${distanceText}\nto your quest destination`,
              { durationMs: 3000 }
            );
            
            // Audio notification for distance
            const audioDistance = distance < 1 
              ? `${distanceInMeters} meters` 
              : `${distance.toFixed(1)} kilometers`;
            await this.playTTSWithDebounce(session, `You are ${audioDistance} from your quest destination.`, {
              voice_settings: {
                stability: 0.7,
                similarity_boost: 0.8,
                speed: 1.0
              }
            });
          }
        }
      }
    } catch (error) {
      session.logger.warn("Error showing distance card", { error });
    }
  }

  /**
   * Check if user is near their quest location and notify them
   */
  private async checkQuestProximity(
    userId: string,
    locationData: any,
    session: any
  ): Promise<void> {
    try {
      const activeQuest = await this.database.getUserActiveQuest(userId);
      if (activeQuest) {
        // Get the specific quest template for the user's active quest
        const questTemplate = await this.database.getQuestTemplateById(
          activeQuest.quest_template_id
        );
        if (
          questTemplate &&
          questTemplate.location_lat &&
          questTemplate.location_lng
        ) {
          const distance = this.calculateDistance(
            locationData.lat,
            locationData.lng,
            questTemplate.location_lat,
            questTemplate.location_lng
          );

          // Show distance to quest location with throttling
          const distanceInMeters = Math.round(distance * 1000);
          const now = Date.now();
          const lastNotification = this.lastDistanceNotificationMap.get(userId) || 0;
          
          // Show distance notification every 6 seconds, using TextWall for better visibility
          if (now - lastNotification > 6000) {
            this.lastDistanceNotificationMap.set(userId, now);
            
            // If within 100 meters of quest location, notify user they're close
            if (distance <= 0.1) {
              // 0.1 km = 100 meters
              session.layouts.showTextWall(
                `🎯 Quest Location Nearby!\nYou're ${distanceInMeters}m away from your quest destination!`,
                { durationMs: 2000 }
              );
            } else {
              // Show distance for locations further away
              const distanceText = distance < 1 
                ? `${distanceInMeters}m` 
                : `${distance.toFixed(1)}km`;
              
              session.layouts.showTextWall(
                `📍 Quest Distance: ${distanceText}\nto your quest destination`,
                { durationMs: 2000 }
              );
            }
            
            // Also log the distance for debugging
            session.logger.info("Distance to quest", {
              distanceKm: distance,
              distanceMeters: distanceInMeters,
              questTitle: questTemplate.title
            });
          }
        }
      }
    } catch (error) {
      session.logger.warn("Error checking quest location proximity", { error });
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param lat1 - First latitude
   * @param lng1 - First longitude
   * @param lat2 - Second latitude
   * @param lng2 - Second longitude
   * @returns Distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

// Start the server
const app = new ExampleMentraOSApp();

app.start().catch(console.error);
