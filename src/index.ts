import { ToolCall, AppServer, AppSession } from "@mentra/sdk";
import path from "path";
import { setupExpressRoutes } from "./webview";
import { handleToolCall } from "./tools";
import { QuestDatabase, QuestTemplate, ActiveQuest, User } from "./database";
import { GooglePlacesService } from "./places-service";
import { WeatherService } from './weather-service';
import { BusinessHoursService } from './business-hours-service';
import { CompetitionService } from './competition-service';
import { DirectionsService } from './directions-service';
import { AIQuestGenerator, QuestContext, AIGeneratedQuest } from "./ai-quest-generator";
import { SampleQuestSeeder } from "./sample-quests";

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
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ??
  (() => {
    throw new Error("ANTHROPIC_API_KEY is not set in .env file");
  })();
const WEATHER_API_KEY =
  process.env.WEATHER_API_KEY || "your_weather_api_key_here";
const PORT = parseInt(process.env.PORT || "3000");

class ExampleMentraOSApp extends AppServer {
  public database: QuestDatabase;
  public placesService: GooglePlacesService;
  public aiQuestGenerator: AIQuestGenerator;
  public competitionService: CompetitionService;
  public directionsService: DirectionsService;

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

    // Set up AI quest generator
    this.aiQuestGenerator = new AIQuestGenerator(
      ANTHROPIC_API_KEY,
      WEATHER_API_KEY
    );

    // Set up competition service
    this.competitionService = new CompetitionService();

    // Set up directions service
    this.directionsService = new DirectionsService(GOOGLE_PLACES_API_KEY);

    // Set up Express routes
    setupExpressRoutes(this);
  }

  /** Map to store active user sessions */
  private userSessionsMap = new Map<string, AppSession>();

  /** Map to store user's last known location */
  public userLocationsMap = new Map<
    string,
    { lat: number; lng: number; timestamp: Date }
  >();

  /** Map to store last distance notification time to prevent spam */
  private lastDistanceNotificationMap = new Map<string, number>();


  /** Map to track when scrolling text is active for each user */
  private scrollingTextActive = new Map<string, boolean>();

  /** TTS debounce system */
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
    options?: {
      voice_id?: string;
      model_id?: string;
      voice_settings?: {
        stability?: number;
        similarity_boost?: number;
        style?: number;
        use_speaker_boost?: boolean;
        speed?: number;
      };
    },
    forcePlay: boolean = false
  ): Promise<boolean> {
    const userId = Array.from(this.userSessionsMap.entries()).find(
      ([_, sess]) => sess === session
    )?.[0];

    if (!userId) return false;

    const now = Date.now();
    const lastTTSTime = this.lastTTSTimeMap.get(userId) || 0;
    const isCurrentlyPlaying = this.activeTTSMap.get(userId) || false;
    const debounceDelay = 2000; // 2 seconds debounce

    // Check if we should play TTS
    const timeSinceLastTTS = now - lastTTSTime;
    const shouldPlay =
      forcePlay || (!isCurrentlyPlaying && timeSinceLastTTS > debounceDelay);

    if (!shouldPlay) {
      session.logger.info("TTS skipped due to debounce", {
        timeSinceLastTTS,
        isCurrentlyPlaying,
        forcePlay,
        text: text.substring(0, 30) + "...",
      });
      return false;
    }

    try {
      // Mark as playing and update timestamp BEFORE starting TTS
      this.activeTTSMap.set(userId, true);
      this.lastTTSTimeMap.set(userId, now);

      // Use proper AudioManager API with default settings optimized for real-time use
      const ttsOptions = {
        model_id: "eleven_flash_v2_5", // Ultra-fast model for real-time use
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.8,
          speed: 1.0,
          ...options?.voice_settings,
        },
        ...options,
      };

      const result = await session.audio.speak(text, ttsOptions);

      if (result.success) {
        session.logger.info("TTS played successfully", {
          text: text.substring(0, 50) + "...",
          duration: result.duration,
        });

        // Keep the debounce active for a short period after TTS completes
        setTimeout(() => {
          this.activeTTSMap.set(userId, false);
        }, 500); // 500ms buffer after TTS completes

        return true;
      } else {
        session.logger.warn("TTS failed", {
          error: result.error,
          text: text.substring(0, 50) + "...",
        });
        this.activeTTSMap.set(userId, false);
        return false;
      }
    } catch (error) {
      session.logger.warn("Failed to play TTS", {
        error,
        text: text.substring(0, 50) + "...",
      });
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
   * Generate an AI-powered quest using context and nearby POIs
   */
  private async generateAIQuest(
    lat: number,
    lng: number,
    userId: string,
    session: AppSession
  ): Promise<QuestTemplate | null> {
    try {
      session.logger.info("Generating AI-powered quest", { lat, lng });

      // Get nearby POIs from multiple categories
      const questTypes = [
        "food",
        "exercise",
        "culture",
        "exploration",
      ] as const;
      let allNearbyPOIs: any[] = [];

      for (const questType of questTypes) {
        try {
          const pois = await this.placesService.findNearbyPlaces(
            lat,
            lng,
            questType,
            2000
          );
          allNearbyPOIs = [...allNearbyPOIs, ...pois];
        } catch (error) {
          session.logger.warn(`Failed to fetch ${questType} POIs`, { error });
        }
      }

      if (allNearbyPOIs.length === 0) {
        session.logger.warn("No POIs found nearby, falling back to database");
        return await this.getRandomQuestTemplate();
      }

      // Build context for AI
      const questContext: QuestContext = {
        currentTime: new Date(),
        weather: await this.aiQuestGenerator.getWeather(lat, lng),
        nearbyPOIs: allNearbyPOIs,
        recentQuestCategories: await this.database.getRecentQuestCategories(
          userId,
          3
        ),
        userLocation: { lat, lng },
      };

      session.logger.info("Quest context prepared", {
        poisCount: allNearbyPOIs.length,
        weather: questContext.weather?.condition,
        recentCategories: questContext.recentQuestCategories,
      });

      allNearbyPOIs.push({
        name: "Somewhere nearby",
        formatted_address: "Your current location",
        geometry: { location: { lat, lng } },
        types: ["general"],
        rating: null,
        user_ratings_total: null,
      });

      // Generate quest using AI
      const aiQuest: AIGeneratedQuest =
        await this.aiQuestGenerator.generateQuest(questContext);
      const selectedPOI = allNearbyPOIs[aiQuest.selectedPOIIndex];

      if (!selectedPOI) {
        throw new Error(
          `Invalid POI selection: index ${aiQuest.selectedPOIIndex} out of ${allNearbyPOIs.length} POIs`
        );
      }

      // Get weather recommendations for the quest
      const weatherRecommendations = questContext.weather 
        ? await this.aiQuestGenerator.getWeatherRecommendations(lat, lng)
        : [];

      // Create quest template in database with weather data
      const questTemplate = await this.database.createQuestTemplate({
        title: aiQuest.title,
        description: aiQuest.description,
        category: "ai-generated", // We could infer this from the POI type
        points: aiQuest.points,
        location_name: selectedPOI.name,
        location_address: selectedPOI.formatted_address,
        location_lat: selectedPOI.geometry.location.lat,
        location_lng: selectedPOI.geometry.location.lng,
        weather_dependent: questContext.weather ? true : false,
        suitable_weather: questContext.weather ? [questContext.weather.condition] : [],
        indoor_activity: selectedPOI.types.includes('shopping_mall') || selectedPOI.types.includes('museum') || selectedPOI.types.includes('library'),
        required_items: weatherRecommendations,
      });

      session.logger.info("Generated AI-powered quest", {
        questId: questTemplate.id,
        selectedPOI: selectedPOI.name,
        aiReasoning: aiQuest.reasoning,
        points: aiQuest.points,
        distance: this.calculateDistance(
          lat,
          lng,
          selectedPOI.geometry.location.lat,
          selectedPOI.geometry.location.lng
        ),
      });

      return questTemplate;
    } catch (error) {
      session.logger.error("Error generating AI-powered quest", { error });
      // Fallback to the old method
      return await this.generateFallbackQuest(lat, lng, userId, session);
    }
  }

  /**
   * Fallback quest generation using the old method
   */
  private async generateFallbackQuest(
    lat: number,
    lng: number,
    userId: string,
    session: AppSession
  ): Promise<QuestTemplate | null> {
    try {
      const questLocations = await this.placesService.findQuestLocations(
        lat,
        lng
      );

      if (questLocations.length === 0) {
        return await this.getRandomQuestTemplate();
      }

      const randomLocation =
        questLocations[Math.floor(Math.random() * questLocations.length)];
      const questData = this.placesService.generateQuestDescription(
        randomLocation.place,
        randomLocation.questType
      );

      // Get weather data for enhanced quest creation
      const weather = await this.aiQuestGenerator.getWeather(lat, lng);
      const weatherRecommendations = weather 
        ? await this.aiQuestGenerator.getWeatherRecommendations(lat, lng)
        : [];

      const questTemplate = await this.database.createQuestTemplate({
        title: questData.title,
        description: questData.description,
        category: randomLocation.category,
        points: questData.points,
        location_name: randomLocation.place.name,
        location_address: randomLocation.place.formatted_address,
        location_lat: randomLocation.place.geometry.location.lat,
        location_lng: randomLocation.place.geometry.location.lng,
        weather_dependent: weather ? true : false,
        suitable_weather: weather ? [weather.condition] : [],
        indoor_activity: randomLocation.place.types?.includes('shopping_mall') || randomLocation.place.types?.includes('museum') || false,
        required_items: weatherRecommendations,
      });

      return questTemplate;
    } catch (error) {
      session.logger.error("Error in fallback quest generation", { error });
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
    // First split by newlines to respect existing line breaks
    const paragraphs = text.split("\n");
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === "") {
        lines.push("");
      } else {
        const words = paragraph.split(" ");
        let currentLine = "";

        for (const word of words) {
          if (word.trim() === "") continue;

          if (currentLine === "") {
            currentLine = word;
          } else if ((currentLine + " " + word).length <= maxLineLength) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine.trim() !== "") lines.push(currentLine);
      }
    }

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
    scrollDelay: number = 1400
  ): Promise<void> {
    const userId = Array.from(this.userSessionsMap.entries()).find(
      ([_, sess]) => sess === session
    )?.[0];

    const lines = this.wrapText(content);

    // If content fits in one screen, show normally
    if (lines.length <= maxLinesPerScreen) {
      session.layouts.showReferenceCard(title, content, { durationMs: -1 });
      return;
    }

    // Mark scrolling as active for this user
    if (userId) {
      this.scrollingTextActive.set(userId, true);
    }

    session.logger.info("Displaying scrolling text", {
      totalLines: lines.length,
      maxLinesPerScreen,
      scrollDelay,
    });

    // Calculate total scrolling duration
    const totalScrollPositions = lines.length - maxLinesPerScreen + 1;

    // Show initial screen first (lines 0-4)
    let currentWindow = lines.slice(0, maxLinesPerScreen);
    session.layouts.showReferenceCard(title, currentWindow.join("\n"), {
      durationMs: scrollDelay * 1.5,
    });

    // Wait before starting to scroll
    await new Promise((resolve) => setTimeout(resolve, scrollDelay));

    // Scroll through the content one line at a time
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

    // Mark scrolling as completed for this user
    if (userId) {
      this.scrollingTextActive.set(userId, false);
    }
  }

  /**
   * Display a quest template to the user using MentraOS layouts with scrolling for long content
   */
  private async displayQuestTemplate(
    session: AppSession,
    questTemplate: QuestTemplate,
    userId: string,
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

    // Add weather recommendations if available
    let weatherInfo = '';
    if (questTemplate.required_items && questTemplate.required_items.length > 0) {
      const items = Array.isArray(questTemplate.required_items) 
        ? questTemplate.required_items 
        : JSON.parse(questTemplate.required_items as string);
      if (items.length > 0) {
        weatherInfo = `\n\n🌤️ Recommended items: ${items.join(', ')}`;
      }
    }

    // Add historical/cultural info if available
    let culturalInfo = '';
    if (questTemplate.historical_significance) {
      culturalInfo = `\n\n🏛️ Historical note: ${questTemplate.historical_significance}`;
    } else if (questTemplate.cultural_info) {
      culturalInfo = `\n\n🎭 Cultural info: ${questTemplate.cultural_info}`;
    }

    // Add accessibility info if we have location data
    let accessibilityInfo = '';
    if (questTemplate.location_lat && questTemplate.location_lng) {
      try {
        const mockPOI: any = {
          name: questTemplate.location_name,
          formatted_address: questTemplate.location_address,
          geometry: { location: { lat: questTemplate.location_lat, lng: questTemplate.location_lng } },
          types: questTemplate.indoor_activity ? ['establishment'] : ['tourist_attraction'],
          rating: null,
          user_ratings_total: null
        };
        const accessibilityStatus = this.aiQuestGenerator.getAccessibilityStatus(mockPOI);
        accessibilityInfo = `\n\n⏰ ${accessibilityStatus}`;
      } catch (error) {
        // Silently fail if accessibility check fails
      }
    }

    const questContent = `${questTemplate.description}\n\n📍 Location: ${questTemplate.location_name}\n${questTemplate.location_address}${distanceInfo}\n\n🏆 Points: ${questTemplate.points}${weatherInfo}${culturalInfo}${accessibilityInfo}`;

    // Use scrolling display for long content
    await this.displayScrollingText(
      session,
      `🎯 ${questTemplate.title}`,
      questContent
    );


    session.logger.info("Quest displayed", {
      questId: questTemplate.id,
      title: questTemplate.title,
      category: questTemplate.category,
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
      this.displayScrollingText(
        session,
        `🎮 POI Quest App loaded!`,
        `👤 Total Points: ${user.total_points}\n🏆 Quests Completed: ${user.quests_completed}\n\nSay 'new quest' to begin your adventure!\n\nCommands: 'current quest', 'complete quest', 'reroll quest', 'get directions'`
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
            timestamp: locationData.timestamp
              ? new Date(locationData.timestamp).toLocaleString()
              : "Unknown",
          });

          // Store user's current location
          this.userLocationsMap.set(userId, {
            lat: locationData.lat,
            lng: locationData.lng,
            timestamp: new Date(),
          });
          console.log(`Stored location for user ${userId}:`, {
            lat: locationData.lat,
            lng: locationData.lng,
            mapSize: this.userLocationsMap.size
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

    session.logger.info("Location tracking started");

    /**
     * Handles quest-related voice commands
     * @param text - The transcription text to process
     */
    const handleQuestCommands = async (text: string): Promise<void> => {
      const normalizedText = text.toLowerCase().trim();

      if (this.scrollingTextActive.get(userId)) {
        session.logger.debug("Not processing text - scrolling text is active");
        return;
      }

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
            await this.playTTSWithDebounce(
              session,
              "Finding your next adventure!",
              {
                voice_settings: { stability: 0.6, speed: 1.1 },
              }
            );
            session.layouts.showTextWall(
              "🔍 AI is analyzing your surroundings for the perfect adventure...",
              {
                durationMs: 3000,
              }
            );
            questTemplate = await this.generateAIQuest(
              userLocation.lat,
              userLocation.lng,
              userId,
              session
            );
          } else {
            await this.playTTSWithDebounce(
              session,
              "Finding your next adventure!",
              {
                voice_settings: { stability: 0.6, speed: 1.1 },
              }
            );
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
                userId,
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
                userId,
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
        normalizedText.includes("finish quest") ||
        normalizedText.includes("end quest")
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

            // Show completion text immediately
            this.displayScrollingText(
              session,
              "🎉 Quest Completed!",
              `Congratulations! You earned ${points} points for completing "${
                questTemplate?.title || "your quest"
              }"!\n\n📊 Total Points: ${
                user?.total_points || 0
              }\n🏆 Quests Completed: ${
                user?.quests_completed || 0
              }\n\nSay 'new quest' for your next adventure.`
            );

            // Play celebration audio (non-blocking)
            this.playTTSWithDebounce(
              session,
              `Quest completed! You earned ${points} points. Your total is now ${
                user?.total_points || 0
              } points.`,
              {
                voice_settings: {
                  stability: 0.4,
                  similarity_boost: 0.85,
                  style: 0.8,
                  speed: 1.0,
                },
              },
              true // Force play for quest completion
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
      } else if (
        normalizedText.includes("show leaderboard") ||
        normalizedText.includes("get leaderboard") ||
        normalizedText.includes("rankings") ||
        normalizedText.includes("leaderboard")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Checking the rankings...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showLeaderboard(session);
        } catch (error) {
          session.logger.error("Error showing leaderboard", { error });
          session.layouts.showTextWall(
            "Error loading leaderboard. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("show progress") ||
        normalizedText.includes("my progress") ||
        normalizedText.includes("streak")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Checking your progress...", {
            voice_settings: { stability: 0.6, speed: 1.1 }
          });
          await this.showProgress(session, userId);
        } catch (error) {
          session.logger.error("Error showing progress", { error });
          session.layouts.showTextWall(
            "Error loading progress. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("show distance") ||
        normalizedText.includes("how far") ||
        normalizedText.includes("distance")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Calculating your location...", {
            voice_settings: { stability: 0.6, speed: 1.1 }
          });
          await this.showDistanceCardForUser(userId, session);
        } catch (error) {
          session.logger.error("Error showing distance", { error });
          session.layouts.showTextWall(
            "Error calculating distance. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("get directions") ||
        normalizedText.includes("directions") ||
        normalizedText.includes("how do i get there") ||
        normalizedText.includes("navigate")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Getting directions...", {
            voice_settings: { stability: 0.6, speed: 1.1 }
          });
          await this.showDirectionsForUser(userId, session);
        } catch (error) {
          session.logger.error("Error showing directions", { error });
          session.layouts.showTextWall(
            "Error getting directions. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("reroll quest") ||
        normalizedText.includes("re-roll quest") ||
        normalizedText.includes("new quest please") ||
        normalizedText.includes("different quest") ||
        normalizedText.includes("skip quest")
      ) {
        try {
          // Check if user has an active quest to reroll
          const existingQuest = await this.database.getUserActiveQuest(userId);
          if (!existingQuest) {
            session.layouts.showTextWall(
              "You don't have an active quest to reroll. Say 'new quest' to get one!",
              { durationMs: 3000 }
            );
            return;
          }

          // Mark current quest as abandoned
          await this.database.abandonQuest(existingQuest.id);

          await this.playTTSWithDebounce(
            session,
            "Getting you a different adventure...",
            {
              voice_settings: { stability: 0.6, speed: 1.1 },
            }
          );

          session.layouts.showTextWall(
            "🔄 Quest abandoned. Getting you a new adventure...",
            { durationMs: 3000 }
          );

          // Generate a new quest
          const userLocation = this.userLocationsMap.get(userId);
          let questTemplate: QuestTemplate | null = null;

          if (userLocation) {
            session.layouts.showTextWall(
              "🔍 AI is analyzing your surroundings for a different adventure...",
              { durationMs: 10000 }
            );
            questTemplate = await this.generateAIQuest(
              userLocation.lat,
              userLocation.lng,
              userId,
              session
            );
          } else {
            session.logger.info(
              "No location available, using random quest for reroll"
            );
            questTemplate = await this.getRandomQuestTemplate();
          }

          if (questTemplate) {
            const activeQuest = await this.database.createActiveQuest(
              userId,
              questTemplate.id
            );
            if (activeQuest) {
              await this.displayQuestTemplate(
                session,
                questTemplate,
                userId,
                userLocation
              );
              session.layouts.showTextWall(
                "🎯 Here's your new quest! Say 'complete quest' when done.",
                { durationMs: 4000 }
              );
            } else {
              session.layouts.showTextWall(
                "Failed to create new quest. Please try again.",
                { durationMs: 3000 }
              );
            }
          } else {
            session.layouts.showTextWall(
              "No new quests available right now. Please try again later.",
              { durationMs: 3000 }
            );
          }
        } catch (error) {
          session.logger.error("Error rerolling quest", { error });
          session.layouts.showTextWall(
            "Error getting new quest. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("challenges") ||
        normalizedText.includes("community challenges") ||
        normalizedText.includes("weekly challenge") ||
        normalizedText.includes("monthly challenge")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Loading community challenges...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showChallenges(session, userId);
        } catch (error) {
          session.logger.error("Error showing challenges", { error });
          session.layouts.showTextWall(
            "Error loading challenges. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("teams") ||
        normalizedText.includes("my team") ||
        normalizedText.includes("join team") ||
        normalizedText.includes("team competition")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Checking team information...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showTeams(session, userId);
        } catch (error) {
          session.logger.error("Error showing teams", { error });
          session.layouts.showTextWall(
            "Error loading teams. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("quest race") ||
        normalizedText.includes("racing") ||
        normalizedText.includes("race") ||
        normalizedText.includes("speed challenge")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Loading quest races...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showQuestRaces(session, userId);
        } catch (error) {
          session.logger.error("Error showing quest races", { error });
          session.layouts.showTextWall(
            "Error loading quest races. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("regional leaderboard") ||
        normalizedText.includes("regional rankings") ||
        normalizedText.includes("city leaderboard") ||
        normalizedText.includes("local rankings")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Loading regional rankings...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showRegionalLeaderboard(session, userId);
        } catch (error) {
          session.logger.error("Error showing regional leaderboard", { error });
          session.layouts.showTextWall(
            "Error loading regional leaderboard. Please try again.",
            { durationMs: 3000 }
          );
        }
      } else if (
        normalizedText.includes("my stats") ||
        normalizedText.includes("user stats") ||
        normalizedText.includes("achievements") ||
        normalizedText.includes("badges")
      ) {
        try {
          await this.playTTSWithDebounce(session, "Loading your statistics...", {
            voice_settings: { stability: 0.6, speed: 1.1 },
          });
          await this.showUserStats(session, userId);
        } catch (error) {
          session.logger.error("Error showing user stats", { error });
          session.layouts.showTextWall(
            "Error loading statistics. Please try again.",
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


      // Clear scrolling text state
      this.scrollingTextActive.delete(userId);

      // Clean up TTS tracking
      this.lastTTSTimeMap.delete(userId);
      this.activeTTSMap.delete(userId);

      if (stopLocationUpdates) {
        stopLocationUpdates();
      }
    });
  }

  /**
   * Show community challenges
   */
  private async showChallenges(session: AppSession, userId: string): Promise<void> {
    try {
      const userProfile = await this.database.getUserProfile(userId);
      const region = userProfile?.region || 'Boston';
      const challenges = this.competitionService.getActiveChallenges(region);

      if (challenges.length === 0) {
        await this.displayScrollingText(
          session,
          "🏆 Community Challenges",
          "No active challenges in your region right now. Check back later for new community goals!"
        );
        return;
      }

      let challengeText = "Active community challenges in your area:\n\n";
      challenges.forEach((challenge, index) => {
        const progress = Math.round((challenge.current_progress / challenge.target_value) * 100);
        const timeLeft = Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        challengeText += `${index + 1}. ${challenge.title}\n`;
        challengeText += `${challenge.description}\n`;
        challengeText += `Progress: ${challenge.current_progress}/${challenge.target_value} (${progress}%)\n`;
        challengeText += `⏰ ${timeLeft} days left | 👥 ${challenge.participants} participants\n`;
        challengeText += `🏆 Reward: ${challenge.reward_points} points\n\n`;
      });

      challengeText += "Say 'join challenge' to participate in community goals!";

      await this.displayScrollingText(
        session,
        "🏆 Community Challenges",
        challengeText
      );
    } catch (error) {
      session.logger.error("Error showing challenges", { error });
      session.layouts.showTextWall(
        "Error loading challenges. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show teams information
   */
  private async showTeams(session: AppSession, userId: string): Promise<void> {
    try {
      const userProfile = await this.database.getUserProfile(userId);
      const region = userProfile?.region || 'Boston';
      const teams = this.competitionService.getTeamsInRegion(region);

      if (teams.length === 0) {
        await this.displayScrollingText(
          session,
          "👥 Team Competition",
          "No active teams in your region. Be the first to create one!\n\nSay 'create team' to start a new team and compete with friends!"
        );
        return;
      }

      let teamText = "Active teams in your area:\n\n";
      teams.forEach((team, index) => {
        teamText += `${index + 1}. ${team.name}\n`;
        teamText += `${team.description}\n`;
        teamText += `👥 ${team.members.length} members | 🏆 ${team.total_points} points\n`;
        teamText += `📍 ${team.region} | 🎯 ${team.quest_count} quests completed\n\n`;
      });

      teamText += "Say 'join team' to become part of a team adventure!";

      await this.displayScrollingText(
        session,
        "👥 Team Competition",
        teamText
      );
    } catch (error) {
      session.logger.error("Error showing teams", { error });
      session.layouts.showTextWall(
        "Error loading teams. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show quest races
   */
  private async showQuestRaces(session: AppSession, userId: string): Promise<void> {
    try {
      const userProfile = await this.database.getUserProfile(userId);
      const region = userProfile?.region || 'Boston';
      const races = this.competitionService.getActiveQuestRaces(region);

      if (races.length === 0) {
        await this.displayScrollingText(
          session,
          "🏃 Quest Racing",
          "No active quest races right now. Check back later for speed challenges!\n\nQuest races let you compete to complete the same quest fastest!"
        );
        return;
      }

      let raceText = "Active quest races:\n\n";
      races.forEach((race, index) => {
        const timeLeft = Math.ceil((new Date(race.end_time).getTime() - Date.now()) / (1000 * 60 * 60));
        const leaderText = race.participants.find(p => p.position === 1)?.display_name || 'None yet';
        
        raceText += `${index + 1}. ${race.title}\n`;
        raceText += `${race.description}\n`;
        raceText += `👥 ${race.participants.length} participants\n`;
        raceText += `🥇 Leader: ${leaderText}\n`;
        raceText += `⏰ ${timeLeft} hours left\n\n`;
      });

      raceText += "Say 'join race' to compete for the fastest completion time!";

      await this.displayScrollingText(
        session,
        "🏃 Quest Racing",
        raceText
      );
    } catch (error) {
      session.logger.error("Error showing quest races", { error });
      session.layouts.showTextWall(
        "Error loading quest races. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show regional leaderboard
   */
  private async showRegionalLeaderboard(session: AppSession, userId: string): Promise<void> {
    try {
      const userProfile = await this.database.getUserProfile(userId);
      const region = userProfile?.region || 'Boston';
      const leaderboard = this.competitionService.getRegionalLeaderboard(region, 'weekly');

      if (leaderboard.rankings.length === 0) {
        await this.displayScrollingText(
          session,
          `🏆 ${region} Leaderboard`,
          "No rankings available for your region yet. Complete some quests to get on the board!"
        );
        return;
      }

      let leaderboardText = `Top questers in ${region} this week:\n\n`;
      leaderboard.rankings.forEach((entry, index) => {
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const teamInfo = entry.team_name ? ` (${entry.team_name})` : '';
        const badges = entry.badges.join(' ');
        
        leaderboardText += `${rankEmoji} ${entry.display_name}${teamInfo}\n`;
        leaderboardText += `🏆 ${entry.points} points | 🎯 ${entry.quest_count} quests\n`;
        if (badges) leaderboardText += `${badges}\n`;
        leaderboardText += `\n`;
      });

      leaderboardText += `Last updated: ${leaderboard.last_updated.toLocaleString()}\n\n`;
      leaderboardText += "Keep completing quests to climb the rankings!";

      await this.displayScrollingText(
        session,
        `🏆 ${region} Leaderboard`,
        leaderboardText
      );
    } catch (error) {
      session.logger.error("Error showing regional leaderboard", { error });
      session.layouts.showTextWall(
        "Error loading regional leaderboard. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show user statistics and achievements
   */
  private async showUserStats(session: AppSession, userId: string): Promise<void> {
    try {
      const userStats = this.competitionService.getUserStats(userId);
      const achievements = await this.database.getUserAchievements(userId);

      let statsText = `📊 Your Adventure Statistics\n\n`;
      statsText += `🎯 Display Name: ${userStats.display_name}\n`;
      statsText += `🏆 Total Points: ${userStats.total_points}\n`;
      statsText += `📍 Quests Completed: ${userStats.quest_count}\n`;
      statsText += `🏅 Challenges Won: ${userStats.challenges_completed}\n`;
      statsText += `🔥 Current Streak: ${userStats.current_streak} days\n`;
      statsText += `⭐ Best Streak: ${userStats.longest_streak} days\n`;
      statsText += `❤️ Favorite Category: ${userStats.favorite_category}\n`;
      
      if (userStats.team_id) {
        statsText += `👥 Team: Active member\n`;
      }
      
      statsText += `📍 Region: ${userStats.region}\n`;
      statsText += `📅 Member Since: ${userStats.join_date.toLocaleDateString()}\n\n`;

      if (userStats.badges.length > 0) {
        statsText += `🏆 Badges: ${userStats.badges.join(' ')}\n\n`;
      }

      if (achievements.length > 0) {
        statsText += `🎖️ Recent Achievements:\n`;
        achievements.slice(0, 3).forEach(achievement => {
          statsText += `• ${achievement.achievement_name}\n`;
        });
        if (achievements.length > 3) {
          statsText += `... and ${achievements.length - 3} more!\n`;
        }
      } else {
        statsText += `🎖️ Complete more quests to earn achievements!`;
      }

      await this.displayScrollingText(
        session,
        "📊 Your Stats",
        statsText
      );
    } catch (error) {
      session.logger.error("Error showing user stats", { error });
      session.layouts.showTextWall(
        "Error loading statistics. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show user progress including streak information
   */
  private async showProgress(session: AppSession, userId: string): Promise<void> {
    try {
      const user = await this.database.getUser(userId);
      
      if (!user) {
        session.layouts.showTextWall(
          "📊 Progress\n\nUser not found. Please try again.",
          { durationMs: 4000 }
        );
        return;
      }

      // Calculate streak status
      const today = new Date().toISOString().split('T')[0];
      const lastQuestDate = user.last_quest_date;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let streakStatus = "";
      let streakEmoji = "🔥";
      
      if (lastQuestDate === today) {
        streakStatus = "Active today!";
        streakEmoji = "✅";
      } else if (lastQuestDate === yesterdayStr) {
        streakStatus = "Complete a quest today to continue!";
        streakEmoji = "⏰";
      } else if (lastQuestDate === '') {
        streakStatus = "Start your first quest!";
        streakEmoji = "🚀";
      } else {
        streakStatus = "Streak broken - start a new one!";
        streakEmoji = "💔";
      }

      // Build progress content
      const progressContent = `📊 Your Quest Progress

🏆 Total Points: ${user.total_points}
✅ Quests Completed: ${user.quests_completed}
${streakEmoji} Current Streak: ${user.current_streak} days
📅 Last Quest: ${lastQuestDate || 'Never'}

${streakStatus}

Keep completing daily quests to maintain your streak!`;

      // Use displayScrollingText for proper display
      await this.displayScrollingText(
        session,
        "📊 Quest Progress",
        progressContent
      );

      session.logger.info("Progress displayed", {
        userId,
        currentStreak: user.current_streak,
        totalPoints: user.total_points,
        questsCompleted: user.quests_completed,
        lastQuestDate: user.last_quest_date
      });
    } catch (error) {
      session.logger.error("Error showing progress", { error });
      session.layouts.showTextWall(
        "Error loading progress. Please try again.",
        { durationMs: 3000 }
      );
    }
  }

  /**
   * Show leaderboard with all users' points, enumerated rankings, and scrolling
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

      // Build leaderboard content with enumerated rankings
      let leaderboardContent = "";

      users.forEach((user, index) => {
        const rank = index + 1;
        const userId =
          user.id.length > 32 ? `${user.id.substring(0, 29)}...` : user.id;

        leaderboardContent += `${rank}. ${userId}\n`;
        leaderboardContent += `   ${user.total_points} pts | ${user.quests_completed} quests\n\n`;
      });

      // Use displayScrollingText for proper scrolling behavior
      await this.displayScrollingText(
        session,
        "🏆 Quest Leaderboard",
        leaderboardContent.trim()
      );

      session.logger.info("Leaderboard displayed", {
        totalUsers: users.length,
        topUser: users[0]?.id,
        topPoints: users[0]?.total_points,
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
  private async showDistanceCardForUser(
    userId: string,
    session: AppSession
  ): Promise<void> {
    try {
      // Don't show distance card if scrolling text is currently active
      if (this.scrollingTextActive.get(userId)) {
        session.logger.debug(
          "Skipping distance card display - scrolling text is active"
        );
        return;
      }
      const activeQuest = await this.database.getUserActiveQuest(userId);
      if (activeQuest) {
        const questTemplate = await this.database.getQuestTemplateById(
          activeQuest.quest_template_id
        );
        const userLocation = this.userLocationsMap.get(userId);

        if (
          questTemplate &&
          questTemplate.location_lat &&
          questTemplate.location_lng &&
          userLocation
        ) {
          const distance = this.calculateDistance(
            userLocation.lat,
            userLocation.lng,
            questTemplate.location_lat,
            questTemplate.location_lng
          );

          const distanceInMeters = Math.round(distance * 1000);

          // Try to get walking directions
          let directionsText = '';
          try {
            const directions = await this.directionsService.getWalkingDirections(
              userLocation.lat,
              userLocation.lng,
              questTemplate.location_lat,
              questTemplate.location_lng
            );

            if (directions) {
              const nextSteps = this.directionsService.getNextTwoSteps(directions);
              if (nextSteps.length > 0) {
                directionsText = '\n\n' + nextSteps.join('\n');
              }
            }
          } catch (error) {
            // Silently fail and show just distance
            session.logger.debug('Failed to get directions, showing distance only', { error });
          }

          if (distance <= 0.1) {
            session.layouts.showTextWall(
              `🎯 Quest Location Nearby!\nYou're ${distanceInMeters}m away from your quest destination!${directionsText}`,
              { durationMs: 5000 }
            );
          } else {
            const distanceText =
              distance < 1
                ? `${distanceInMeters}m`
                : `${distance.toFixed(1)}km`;

            session.layouts.showTextWall(
              `📍 Quest Distance: ${distanceText}\nto your quest destination${directionsText}`,
              { durationMs: 5000 }
            );
          }
        }
      }
    } catch (error) {
      session.logger.warn("Error showing distance card", { error });
    }
  }

  /**
   * Show detailed directions for a specific user
   */
  private async showDirectionsForUser(
    userId: string,
    session: AppSession
  ): Promise<void> {
    try {
      const activeQuest = await this.database.getUserActiveQuest(userId);
      if (!activeQuest) {
        session.layouts.showTextWall(
          "No active quest. Say 'new quest' to get one!",
          { durationMs: 3000 }
        );
        return;
      }

      const questTemplate = await this.database.getQuestTemplateById(
        activeQuest.quest_template_id
      );
      const userLocation = this.userLocationsMap.get(userId);

      if (!questTemplate || !questTemplate.location_lat || !questTemplate.location_lng) {
        session.layouts.showTextWall(
          "Quest location not available for directions.",
          { durationMs: 3000 }
        );
        return;
      }

      if (!userLocation) {
        session.layouts.showTextWall(
          "Your location is needed for directions. Please enable location access.",
          { durationMs: 4000 }
        );
        return;
      }

      // Get walking directions
      const directions = await this.directionsService.getWalkingDirections(
        userLocation.lat,
        userLocation.lng,
        questTemplate.location_lat,
        questTemplate.location_lng
      );

      if (!directions) {
        // Fallback to distance only
        const distance = this.calculateDistance(
          userLocation.lat,
          userLocation.lng,
          questTemplate.location_lat,
          questTemplate.location_lng
        );

        const distanceText = distance < 1
          ? `${Math.round(distance * 1000)}m`
          : `${distance.toFixed(1)}km`;

        session.layouts.showTextWall(
          `📍 Distance to ${questTemplate.location_name}: ${distanceText}\n\nDirections unavailable. Use your preferred maps app.`,
          { durationMs: 5000 }
        );
        return;
      }

      // Show full directions using scrolling text
      const directionsContent = this.directionsService.formatDirectionsForWebview(directions);

      await this.displayScrollingText(
        session,
        `🚶 Directions to ${questTemplate.location_name}`,
        directionsContent
      );

    } catch (error) {
      session.logger.error("Error showing directions", { error });
      session.layouts.showTextWall(
        "Error getting directions. Please try again.",
        { durationMs: 3000 }
      );
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
          const lastNotification =
            this.lastDistanceNotificationMap.get(userId) || 0;

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
              const distanceText =
                distance < 1
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
              questTitle: questTemplate.title,
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
