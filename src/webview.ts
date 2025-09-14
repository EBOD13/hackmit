import { AuthenticatedRequest, AppServer } from '@mentra/sdk';
import express, { Response } from "express";
import path from "path";

/**
 * Sets up all Express routes and middleware for the server
 * @param server The server instance
 */
export function setupExpressRoutes(server: AppServer): void {
  // Get the Express app instance
  const app = server.getExpressApp();

  // Set up EJS as the view engine
  app.set("view engine", "ejs");
  app.engine("ejs", require("ejs").__express);
  app.set("views", path.join(__dirname, "views"));

  // Add JSON parsing middleware for API routes
  app.use(express.json());

  // Register a route for handling webview requests
  app.get("/webview", async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.authUserId;
      let userStats = null;
      let currentQuest = null;
      let questTemplate = null;
      let directions = null;

      if (userId && (server as any).database) {
        const database = (server as any).database;
        const directionsService = (server as any).directionsService;
        const userLocationsMap = (server as any).userLocationsMap;

        // Get user stats
        try {
          await database.initialize();
          let user = await database.getUser(userId);
          if (!user) {
            user = await database.createUser(userId);
          }
          userStats = user;

          // Get current quest
          currentQuest = await database.getUserActiveQuest(userId);
          if (currentQuest) {
            questTemplate = await database.getQuestTemplateById(
              currentQuest.quest_template_id
            );

            // Get directions if quest has location and user location is available
            if (questTemplate && questTemplate.location_lat && questTemplate.location_lng) {
              const userLocation = userLocationsMap?.get(userId);

              if (userLocation && directionsService) {
                try {
                  const walkingDirections = await directionsService.getWalkingDirections(
                    userLocation.lat,
                    userLocation.lng,
                    questTemplate.location_lat,
                    questTemplate.location_lng
                  );

                  if (walkingDirections) {
                    directions = {
                      steps: walkingDirections.steps,
                      totalDistance: walkingDirections.totalDistance,
                      totalDuration: walkingDirections.totalDuration,
                      formatted: directionsService.formatDirectionsForWebview(walkingDirections)
                    };
                  } else {
                    // Fallback to distance calculation using Haversine formula
                    const R = 6371; // Earth's radius in kilometers
                    const dLat = (questTemplate.location_lat - userLocation.lat) * Math.PI / 180;
                    const dLng = (questTemplate.location_lng - userLocation.lng) * Math.PI / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                              Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(questTemplate.location_lat * Math.PI / 180) *
                              Math.sin(dLng/2) * Math.sin(dLng/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const distance = R * c;

                    const distanceText = distance < 1
                      ? `${Math.round(distance * 1000)}m`
                      : `${distance.toFixed(1)}km`;

                    directions = {
                      steps: [],
                      totalDistance: distanceText,
                      totalDuration: null,
                      formatted: null,
                      fallback: true,
                      fallbackMessage: `Distance to ${questTemplate.location_name}: ${distanceText}. Directions unavailable - use your preferred maps app.`
                    };
                  }
                } catch (error) {
                  console.warn('Failed to get walking directions for webview:', error);
                }
              }
            }
          }
        } catch (error) {
          console.error("Error fetching user data for webview:", error);
        }
      }

      res.render("webview", {
        userId,
        userStats,
        currentQuest,
        questTemplate,
        directions,
      });
    } catch (error) {
      console.error("Error rendering webview:", error);
      res.render("webview", {
        userId: undefined,
        userStats: null,
        currentQuest: null,
        questTemplate: null,
        directions: null,
      });
    }
  });

  // API endpoint for getting a new quest
  app.post(
    "/api/quest/new",
    // @ts-ignore
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.authUserId;
        if (!userId) {
          return res.json({ success: false, message: "Not authenticated" });
        }

        const database = (server as any).database;
        const placesService = (server as any).placesService;
        const userLocationsMap = (server as any).userLocationsMap;

        // Check if user already has an active quest
        const existingQuest = await database.getUserActiveQuest(userId);
        if (existingQuest) {
          return res.json({
            success: false,
            message: "You already have an active quest!",
          });
        }

        // Try to generate an AI-powered quest
        const userLocation = userLocationsMap?.get(userId);
        const aiQuestGenerator = (server as any).aiQuestGenerator;
        let questTemplate = null;

        if (userLocation && placesService && aiQuestGenerator) {
          try {
            // Get nearby POIs from multiple categories for AI
            const questTypes = ['food', 'exercise', 'culture', 'exploration'] as const;
            let allNearbyPOIs: any[] = [];

            for (const questType of questTypes) {
              try {
                const pois = await placesService.findNearbyPlaces(userLocation.lat, userLocation.lng, questType, 2000);
                allNearbyPOIs = [...allNearbyPOIs, ...pois];
              } catch (error) {
                console.warn(`Failed to fetch ${questType} POIs for webview`, error);
              }
            }

            if (allNearbyPOIs.length > 0) {
              // Build context for AI
              const questContext = {
                currentTime: new Date(),
                weather: await aiQuestGenerator.getWeather(userLocation.lat, userLocation.lng),
                nearbyPOIs: allNearbyPOIs,
                recentQuestCategories: await database.getRecentQuestCategories(userId, 3),
                userLocation: { lat: userLocation.lat, lng: userLocation.lng }
              };

              // Generate quest using AI
              const aiQuest = await aiQuestGenerator.generateQuest(questContext);
              const selectedPOI = allNearbyPOIs[aiQuest.selectedPOIIndex];

              if (selectedPOI) {
                questTemplate = await database.createQuestTemplate({
                  title: aiQuest.title,
                  description: aiQuest.description,
                  category: 'ai-generated',
                  points: aiQuest.points,
                  location_name: selectedPOI.name,
                  location_address: selectedPOI.formatted_address,
                  location_lat: selectedPOI.geometry.location.lat,
                  location_lng: selectedPOI.geometry.location.lng,
                });
              }
            }
          } catch (error) {
            console.warn('AI quest generation failed in webview, falling back:', error);
          }
        }

        // Fallback to database quest if no location-aware quest available
        if (!questTemplate) {
          questTemplate = await database.getRandomQuestTemplate();
        }

        if (questTemplate) {
          const activeQuest = await database.createActiveQuest(
            userId,
            questTemplate.id
          );
          if (activeQuest) {
            res.json({ success: true, message: "New quest assigned!" });
          } else {
            res.json({ success: false, message: "Failed to create quest" });
          }
        } else {
          res.json({ success: false, message: "No quests available" });
        }
      } catch (error) {
        console.error("Error creating new quest via API:", error);
        res.json({ success: false, message: "Server error" });
      }
    }
  );

  // API endpoint for completing a quest
  app.post(
    "/api/quest/complete",
    // @ts-ignore
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.authUserId;
        if (!userId) {
          return res.json({ success: false, message: "Not authenticated" });
        }

        const database = (server as any).database;

        const activeQuest = await database.getUserActiveQuest(userId);
        if (!activeQuest) {
          return res.json({
            success: false,
            message: "No active quest to complete",
          });
        }

        // Get quest template to get correct points
        const questTemplate = await database.getQuestTemplateById(
          activeQuest.quest_template_id
        );
        const points = questTemplate?.points || 100;

        await database.completeQuest(activeQuest.id, points);

        res.json({
          success: true,
          message: `Quest completed! You earned ${points} points.`,
          points,
        });
      } catch (error) {
        console.error("Error completing quest via API:", error);
        res.json({ success: false, message: "Server error" });
      }
    }
  );

  // API endpoint for getting current quest
  app.get(
    "/api/quest/current",
    // @ts-ignore
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.authUserId;
        if (!userId) {
          return res.json({ success: false, message: "Not authenticated" });
        }

        const database = (server as any).database;

        const activeQuest = await database.getUserActiveQuest(userId);
        if (!activeQuest) {
          return res.json({ success: false, message: "No active quest" });
        }

        const questTemplate = await database.getQuestTemplateById(
          activeQuest.quest_template_id
        );

        res.json({
          success: true,
          quest: activeQuest,
          template: questTemplate,
        });
      } catch (error) {
        console.error("Error fetching current quest via API:", error);
        res.json({ success: false, message: "Server error" });
      }
    }
  );

  // API endpoint for rerolling a quest
  app.post(
    "/api/quest/reroll",
    // @ts-ignore
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.authUserId;
        if (!userId) {
          return res.json({ success: false, message: "Not authenticated" });
        }

        const database = (server as any).database;
        const placesService = (server as any).placesService;
        const userLocationsMap = (server as any).userLocationsMap;
        const aiQuestGenerator = (server as any).aiQuestGenerator;

        // Check if user has an active quest to reroll
        const existingQuest = await database.getUserActiveQuest(userId);
        if (!existingQuest) {
          return res.json({
            success: false,
            message: "You don't have an active quest to reroll!",
          });
        }

        // Mark current quest as abandoned
        await database.abandonQuest(existingQuest.id);

        // Try to generate a new AI-powered quest
        const userLocation = userLocationsMap?.get(userId);
        let questTemplate = null;

        if (userLocation && placesService && aiQuestGenerator) {
          try {
            // Get nearby POIs from multiple categories for AI
            const questTypes = ['food', 'exercise', 'culture', 'exploration'] as const;
            let allNearbyPOIs: any[] = [];

            for (const questType of questTypes) {
              try {
                const pois = await placesService.findNearbyPlaces(userLocation.lat, userLocation.lng, questType, 2000);
                allNearbyPOIs = [...allNearbyPOIs, ...pois];
              } catch (error) {
                console.warn(`Failed to fetch ${questType} POIs for reroll`, error);
              }
            }

            if (allNearbyPOIs.length > 0) {
              // Add fallback option
              allNearbyPOIs.push({
                name: "Somewhere nearby",
                formatted_address: "Your current location",
                geometry: { location: { lat: userLocation.lat, lng: userLocation.lng } },
                types: ["general"],
                rating: null,
                user_ratings_total: null,
              });

              // Build context for AI
              const questContext = {
                currentTime: new Date(),
                weather: await aiQuestGenerator.getWeather(userLocation.lat, userLocation.lng),
                nearbyPOIs: allNearbyPOIs,
                recentQuestCategories: await database.getRecentQuestCategories(userId, 3),
                userLocation: { lat: userLocation.lat, lng: userLocation.lng }
              };

              // Generate quest using AI
              const aiQuest = await aiQuestGenerator.generateQuest(questContext);
              const selectedPOI = allNearbyPOIs[aiQuest.selectedPOIIndex];

              if (selectedPOI) {
                questTemplate = await database.createQuestTemplate({
                  title: aiQuest.title,
                  description: aiQuest.description,
                  category: 'ai-generated',
                  points: aiQuest.points,
                  location_name: selectedPOI.name,
                  location_address: selectedPOI.formatted_address,
                  location_lat: selectedPOI.geometry.location.lat,
                  location_lng: selectedPOI.geometry.location.lng,
                });
              }
            }
          } catch (error) {
            console.warn('AI quest generation failed for reroll, falling back:', error);
          }
        }

        // Fallback to database quest if no location-aware quest available
        if (!questTemplate) {
          questTemplate = await database.getRandomQuestTemplate();
        }

        if (questTemplate) {
          const activeQuest = await database.createActiveQuest(
            userId,
            questTemplate.id
          );
          if (activeQuest) {
            res.json({
              success: true,
              message: "Quest rerolled! Here's your new adventure.",
              quest: activeQuest,
              template: questTemplate
            });
          } else {
            res.json({ success: false, message: "Failed to create new quest" });
          }
        } else {
          res.json({ success: false, message: "No quests available" });
        }
      } catch (error) {
        console.error("Error rerolling quest via API:", error);
        res.json({ success: false, message: "Server error" });
      }
    }
  );

  // API endpoint for getting quest directions
  app.get(
    "/api/quest/directions",
    // @ts-ignore
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userId = req.authUserId;
        if (!userId) {
          return res.json({ success: false, message: "Not authenticated" });
        }

        const database = (server as any).database;
        const directionsService = (server as any).directionsService;
        const userLocationsMap = (server as any).userLocationsMap;

        // Check if user has an active quest
        const activeQuest = await database.getUserActiveQuest(userId);
        if (!activeQuest) {
          return res.json({
            success: false,
            message: "You don't have an active quest!",
          });
        }

        const questTemplate = await database.getQuestTemplateById(
          activeQuest.quest_template_id
        );

        if (!questTemplate || !questTemplate.location_lat || !questTemplate.location_lng) {
          return res.json({
            success: false,
            message: "Quest location not available for directions.",
          });
        }

        const userLocation = userLocationsMap?.get(userId);
        if (!userLocation) {
          return res.json({
            success: false,
            message: "Your location is needed for directions. Please enable location access.",
          });
        }

        // Get walking directions
        const directions = await directionsService.getWalkingDirections(
          userLocation.lat,
          userLocation.lng,
          questTemplate.location_lat,
          questTemplate.location_lng
        );

        if (!directions) {
          // Fallback to distance only - calculate distance manually using Haversine formula
          const R = 6371; // Earth's radius in kilometers
          const dLat = (questTemplate.location_lat - userLocation.lat) * Math.PI / 180;
          const dLng = (questTemplate.location_lng - userLocation.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(userLocation.lat * Math.PI / 180) * Math.cos(questTemplate.location_lat * Math.PI / 180) *
                    Math.sin(dLng/2) * Math.sin(dLng/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;

          const distanceText = distance < 1
            ? `${Math.round(distance * 1000)}m`
            : `${distance.toFixed(1)}km`;

          return res.json({
            success: true,
            message: `Distance to ${questTemplate.location_name}: ${distanceText}. Directions unavailable - use your preferred maps app.`,
            directions: null,
            distance: distanceText,
            quest: activeQuest,
            template: questTemplate
          });
        }

        // Format directions for display
        const directionsText = directionsService.formatDirectionsForWebview(directions);

        res.json({
          success: true,
          message: `Directions to ${questTemplate.location_name}`,
          directions: directionsText,
          distance: directions.totalDistance,
          duration: directions.totalDuration,
          quest: activeQuest,
          template: questTemplate
        });

      } catch (error) {
        console.error("Error getting directions via API:", error);
        res.json({ success: false, message: "Server error" });
      }
    }
  );

  // API endpoint for getting leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const database = (server as any).database;
      const leaderboard = await database.getAllUsersLeaderboard();
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard via API:", error);
      res.json([]);
    }
  });
}
