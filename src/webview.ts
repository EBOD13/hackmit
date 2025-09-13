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

      if (userId && (server as any).database) {
        const database = (server as any).database;

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
      });
    } catch (error) {
      console.error("Error rendering webview:", error);
      res.render("webview", {
        userId: undefined,
        userStats: null,
        currentQuest: null,
        questTemplate: null,
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

        // Try to generate a location-aware quest
        const userLocation = userLocationsMap?.get(userId);
        let questTemplate = null;

        if (userLocation && placesService) {
          const questLocations = await placesService.findQuestLocations(
            userLocation.lat,
            userLocation.lng
          );
          if (questLocations.length > 0) {
            const randomLocation =
              questLocations[Math.floor(Math.random() * questLocations.length)];
            const questData = placesService.generateQuestDescription(
              randomLocation.place,
              randomLocation.questType
            );

            questTemplate = await database.createQuestTemplate({
              title: questData.title,
              description: questData.description,
              category: randomLocation.category,
              points: questData.points,
              location_name: randomLocation.place.name,
              location_address: randomLocation.place.formatted_address,
              location_lat: randomLocation.place.geometry.location.lat,
              location_lng: randomLocation.place.geometry.location.lng,
            });
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
}
